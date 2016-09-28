'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');

const COMMAND_SERVER_PORT = 9613;

// The code of this function is injected into the script mocking the actual
// command.  It must only use std library includes.
function runCommand (commandName, port) {
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
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            process.stdout.write(chunk);
        });
    });

    postRequest.write(postData);
    postRequest.end();
}

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

            respond(200, spy(args));
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
            `(${runCommand.toString()})(${JSON.stringify(commandName)}, ${JSON.stringify(this._port)});`
        ].join('\n');

        if (!fs.existsSync(this._mockCommandPath)) {
            fs.mkdirSync(this._mockCommandPath);
        }

        const commandPath = path.join(this._mockCommandPath, commandName);

        assert(!fs.existsSync(commandPath), `mock command ${commandPath} is already present on disk`);
        fs.writeFileSync(commandPath, data);
        childProcess.execSync('chmod a+x ' + commandPath);
    }

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

    clear () {
        childProcess.execSync(`rm -rf ${this._mockCommandPath}`);

        this._commands = {};
    }

    stop () {
        // todo: stop the server
    }
}

module.exports = MockCommands;
