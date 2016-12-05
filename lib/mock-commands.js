'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');

const COMMAND_SERVER_PORT = 9613;

// The code of this function is injected into the script mocking the actual
// command.
const runCommandCode = (function runCommand (commandName, port) {
    const postData = new Buffer(JSON.stringify({
        args: process.argv.slice(2)
    }));

    const postOptions = {
        host: 'localhost',
        port: port,
        path: `/call/${commandName}`,
        method: 'POST',
        headers: {
            'Content-Type': 'text/json',
            'Content-Length': postData.byteLength
        }
    };

    const postRequest = http.request(postOptions, (res) => {
        const responseJson = [];

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            responseJson.push(chunk);
        });
        res.on('end', () => {
            const response = JSON.parse(responseJson.join(''));
            const stdoutP = new Promise((resolve) => {
                if (response.stdout) {
                    process.stdout.write(response.stdout, resolve);
                } else {
                    resolve();
                }
            });
            const stderrP = new Promise((resolve) => {
                if (response.stderr) {
                    process.stderr.write(response.stderr, resolve);
                } else {
                    resolve();
                }
            });

            Promise.all([stdoutP, stderrP]).then(() => {
                process.exit(response.exitCode);
            });
        });
    });

    postRequest.write(postData);
    postRequest.end();
}).toString();

/**
 * Create small executable scripts that act as mocked commands.
 *
 * The scripts are executed in mockCommandPath and communicate via HTTP to
 * this process with the spy or mock function that defines their behavior.
 */
class MockCommands {

    // also starts the mock server as a side effect and keeps it running until .stop()
    constructor ({mockCommandPath = '', port = 9613} = {}) {
        assert(mockCommandPath, "mockCommandPath must be non-empty");
        assert(path.isAbsolute(mockCommandPath), "mockCommandPath must be absolute");
        assert(!fs.existsSync(mockCommandPath), "mockCommandPath must not exist");

        this._mockCommandPath = mockCommandPath;
        this._port = port;
        this._commands = {};
        this._server = null;

        this.start();
    }

    /**
     * Start the HTTP server that listens for connections from mock scripts.
     */
    start () {

        if (this._server) {
            return;
        }

        // we don't have to wait on the server to come up as the commands
        // won't finish unless they're getting a response from the server
        this._server = http.createServer(this._handleRequest.bind(this)).listen(this._port);
    }

    _handleRequest (req, res) {
        const command = ((/^\/call\/(.*)$/g).exec(req.url) || [])[1];
        const spy = this._commands[command];

        if (!spy) {
            respond(500, `unknown command ${command}`);

            return;
        }

        const bodyData = [];

        req.on('data', (data) => {
            bodyData.push(data.toString());
        });

        req.on('end', () => {
            const args = JSON.parse(bodyData.join(''));
            const response = {
                stdout: null,
                stderr: null,
                exitCode: 0
            };
            const spyResult = spy(args);

            if (typeof spyResult === 'string') {
                response.stdout = spyResult;
            } else if (spyResult === undefined || spyResult === null) {
                response.stdout = '';
            } else {
                assert.equal(
                    typeof spyResult,
                    'object', 'spy response must be either undefined, null, a string or an object with stdout, stderr and exitCode keys'
                );
                Object.assign(response, spyResult);
                assert.deepStrictEqual(Object.keys(response), ['stdout', 'stderr', 'exitCode']);
            }

            respond(200, JSON.stringify(response));
        });

        function respond (status, body) {
            res.writeHead(status, {'Content-Type': 'text/plain'});
            res.end(body);
        }
    }

    _createCommandFile (commandName) {
        const data = [
            '#!/usr/bin/env node',
            'const http = require("http");',
            `(${runCommandCode})(${JSON.stringify(commandName)}, ${JSON.stringify(this._port)});`
        ].join('\n');

        if (!fs.existsSync(this._mockCommandPath)) {
            fs.mkdirSync(this._mockCommandPath);
        }

        const commandPath = path.join(this._mockCommandPath, commandName);

        assert(!fs.existsSync(commandPath), `mock command ${commandPath} is already present on disk`);
        fs.writeFileSync(commandPath, data);
        childProcess.execSync('chmod a+x ' + commandPath);
    }

    /**
     * Create a script with commandName and spy as its implementation.
     *
     * spy must be a function (possibly with side effects such as creating
     * files) returning:
     *  - undefined to cause the mock command just printing '' and exiting normally
     *  - a string to cause the mock command to print it to stdout and exiting normally
     *  - or an object with stdout, stderr and exitCode keys to print strings
     *    to those streams and exit with the given return value
     *
     * Creates a spy if none is given and jasmine is loaded.
     *
     * Returns the spy function.
     */
    mock (commandName, spy) {
        assert(!this._commands[commandName], `command ${commandName} is already mocked`);

        this._createCommandFile(commandName);

        let commandSpy = spy;

        if (!spy) {
            if (global.jasmine) {
                spy = global.jasmine.createSpy(`command: ${commandName}`);
            } else {
                spy = () => {};
            }
        }

        this._commands[commandName] = spy;

        return spy;
    }

    /**
     * Remove all created mock scripts from an internal list.
     *
     * Does not delete the actual script files.
     */
    clearCommands () {
        this._commands = {};
    }
}

module.exports = MockCommands;
