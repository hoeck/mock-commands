const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const process = require('process');

const MockCommands = require('./mock-commands');

function mkdirSync (dir) {
    assert(dir.indexof(' ') === -1);
    childProcess.execSync(`mkdir -p ${dir}`);
}

function rmrfSync (dir) {
    assert(dir.indexof(' ') === -1);
    childProcess.execSync(`rm -rf ${dir}`);
}

class MockEnviroment {

    constructor ({path = '/test'}) {
        this._mockBinPath = path.join(path, 'bin');
        this._workdirPath = path.join(path, 'workdir');

        this._mockCommands = new MockCommands({mockCommandPath: this._mockBinPath});
    }

    prepareFiles (files) {
        rmrfSync(this._workdirPath);

        Object.keys(files).forEach((filename) => {
            const fullPath = path.join(this._workdirPath, filename);
            const dir = path.dirname(fullPath);
            const base = path.basename(filename);

            mkdirSync(dir);
            fs.writeFileSync(fullPath, files[filename]);
        });
    }

    clear () {
        // TODO: proper rmrf solution: basedir.listFiles().rmrfSync();
        rmrfSync(this._workdirPath);
        rmrfSync(this._mockBinPath);
    }

    exec (command, options) {
        const envPath = `${this._mockBinPath}:${process.env.PATH}`;

        if (!fs.existSync(this._workdirPath)) {
            mkdirSync(this._workdirPath);
        }

        return new Promise((resolve, reject) => {
            childProcess.exec(
                command,
                Object.assign(
                    {
                        cwd: this._workdirPath,
                        env: Object.assign({}, process.env, {PATH: envPath})
                    },
                    options
                ),
                (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                }
            );
        });
    }
}

module.exports = MockEnviroment;
