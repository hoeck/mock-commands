const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const process = require('process');

const MockCommands = require('./mock-commands');

function mkdirSync (dir) {
    assert(dir.indexOf(' ') === -1);
    childProcess.execSync(`mkdir -p ${dir}`);
}

function rmrfSync (dir) {
    assert(dir.indexOf(' ') === -1);
    childProcess.execSync(`rm -rf ${dir}`);
}

function isTmpfsSync (dir) {
    return childProcess.execSync(`stat -f -c %T ${dir}`).toString().trim() === 'tmpfs';
}

class ExecError extends Error {
    constructor ({error, stdout, stderr, exitCode}) {
        super(error.message);
        this.error = error;
        this.stdout = stdout;
        this.stderr = stderr;
        this.exitCode = exitCode;
    }
}

class MockEnviroment {

    static getInstance () {
        if (!MockEnviroment._instance) {
            MockEnviroment._instance = new MockEnviroment();
        }

        return MockEnviroment._instance;
    }

    constructor ({mockPath = '/test'} = {}) {
        assert(isTmpfsSync(mockPath), `"${mockPath}" must be on a tmpfs mount`);

        this._mockBinPath = path.join(mockPath, 'bin');
        this._workdirPath = path.join(mockPath, 'workdir');

        this._mockCommands = new MockCommands({mockCommandPath: this._mockBinPath});

        // workdir must be present, otherwise exec will fail
        mkdirSync(this._workdirPath);
    }

    createFiles (files) {
        Object.keys(files).forEach((filename) => {
            const fullPath = path.join(this._workdirPath, filename);
            const dir = path.dirname(fullPath);
            const base = path.basename(filename);

            mkdirSync(dir);
            fs.writeFileSync(fullPath, files[filename]);
        });
    }

    mockCommand (name, spy) {
        return this._mockCommands.mock(name, spy);
    }

    getWorkdir () {
        return this._workdirPath;
    }

    clear () {
        this._mockCommands.clearCommands();

        rmrfSync(this._workdirPath);
        rmrfSync(this._mockBinPath);

        // recreate workdir, otherwise subsequent calls to exec with workdir
        // as CWD will fail
        mkdirSync(this._workdirPath);
    }

    exec (command, options) {
        const envPath = `${this._mockBinPath}:${process.env.PATH}`;

        return new Promise((resolve, reject) => {
            const cp = childProcess.exec(
                command,
                Object.assign(
                    {
                        cwd: this._workdirPath,
                        env: Object.assign({}, process.env, {PATH: envPath})
                    },
                    options
                ),
                (err, stdout, stderr) => {
                    if (err) {
                        reject(new ExecError({error: err, stdout, stderr, exitCode: cp.exitCode}));
                    } else {
                        resolve({stdout, stderr, exitCode: cp.exitCode});
                    }
                }
            );
        });
    }
}

module.exports = MockEnviroment;
