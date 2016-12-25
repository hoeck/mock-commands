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

function whichSync (name) {
    return childProcess.execSync(`which ${name}`).toString().trim();
}

function findFilesSync (dir) {
    const absDir = path.resolve(dir);

    return childProcess.execSync(`find ${dir}`)
        .toString('utf-8')
        .trim()
        .split('\n')
        .map((filename) => {
            return filename.slice(absDir.length+1);
        });
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

/**
 * Define the execution environment of commandline programs.
 */
class MockEnviroment {

    /**
     * Return the same instance of MockEnviroment.
     */
    static getInstance () {
        if (!MockEnviroment._instance) {
            MockEnviroment._instance = new MockEnviroment();
        }

        return MockEnviroment._instance;
    }

    /**
     * ctor, mockPath is the path where the environment is created.
     *
     * environment === working directory and a /bin path for mock commands
     */
    constructor ({mockPath = '/test'} = {}) {
        assert(isTmpfsSync(mockPath), `"${mockPath}" must be on a tmpfs mount`);
        assert(mockPath.indexOf(' ') === -1, `"${mockPath}" must not contain any spaces`);
        assert(mockPath[0] !== '-', `"${mockPath}" must not start with a dash`);

        this._mockBinPath = path.join(mockPath, 'bin');
        this._workdirPath = path.join(mockPath, 'workdir');

        this._mockCommands = new MockCommands({mockCommandPath: this._mockBinPath});

        this._hostsFile = '/etc/hosts';
        this._originalHostsFile = '/etc/hosts.mock-script-environment.original';

        // workdir must be present, otherwise exec will fail
        mkdirSync(this._workdirPath);
    }

    /**
     * Create files in the working directory.
     *
     * files must be a mapping of (workdir relative) filenames to file contents.
     *
     * Example: {'foo/bar/baz.json': '["a", "b", "c"]}
     */
    writeFiles (files) {
        Object.keys(files).forEach((filename) => {
            const fullPath = path.join(this._workdirPath, filename);
            const dir = path.dirname(fullPath);
            const base = path.basename(filename);

            mkdirSync(dir);
            fs.writeFileSync(fullPath, files[filename]);
        });
    }

    /**
     * Read all files from the working directory into an object.
     *
     * Exact opposite of .writeFiles.
     *
     * Returns a mapping from (workdir relative) filenames to file contents.
     */
    readFiles () {
        const allFileNames = findFilesSync(this._workdirPath);

        return Object.assign(
            {},
            ...allFileNames
                .filter((name) => {
                    return fs.statSync(path.join(this._workdirPath, name)).isFile();
                })
                .map((name) => {
                    return {[name]: fs.readFileSync(path.join(this._workdirPath, name)).toString('utf-8')};
                })
        );
    }

    /**
     * Create a script on the bin path with commandName and spy as its implementation.
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
    mockCommand (name, spy) {
        return this._mockCommands.mock(name, spy);
    }

    /**
     * Add commandName to the bin path.
     *
     * Create a symlink in the bin path from commandName to commandPath. When
     * commandPath is not given, use `which <commandName>`.
     */
    provideCommand (commandName, commandPath) {
        mkdirSync(this._mockBinPath);

        const newPath = path.join(this._mockBinPath, commandName);
        const oldPath = commandPath || whichSync(commandName);

        fs.symlinkSync(oldPath, newPath);
    }

    /**
     * Return the working directory.
     *
     * This directory is set as the working dir when executing programs with
     * .exec().
     */
    getWorkdir () {
        return this._workdirPath;
    }

    /**
     * Add an entry for <hostname> and <ipAddress> to /etc/hosts.
     *
     * calling .clear() will reset the hosts file to its previous state.
     */
    mockHost (hostname, ipAddress='127.0.0.1') {
        assert(hostname, 'hostname must not be empty');

        // backup the original hosts file
        if (!fs.existsSync(this._originalHostsFile)) {
            fs.writeFileSync(this._originalHostsFile, fs.readFileSync(this._hostsFile));
        }

        fs.appendFileSync(this._hostsFile, `\n# added by mock-script-environment\n${ipAddress} ${hostname}\n`);
    }

    /**
     * Reset the script environment.
     *
     * Remove all files created with .writeFiles(), mocks created with
     * .mockCommand() and reset /etc/hosts.
     */
    clear () {
        this._mockCommands.clearCommands();

        rmrfSync(this._workdirPath);
        rmrfSync(this._mockBinPath);

        if (fs.existsSync(this._originalHostsFile)) {
            fs.writeFileSync(this._hostsFile, fs.readFileSync(this._originalHostsFile));
            fs.unlink(this._originalHostsFile);
        }

        // recreate workdir, otherwise subsequent calls to exec with workdir
        // as CWD will fail
        mkdirSync(this._workdirPath);
    }

    /**
     * Execute a command within this script environment.
     *
     * Workdir and PATH are modified so that the command runs in a known
     * environment of files and commands. Path is completely isolated, so
     * every other command called by command must be mocked sing mockCommand.
     *
     * Returns a promise resolving to {stdout, stderr, exitCode}.
     */
    exec (command, options) {
        return new Promise((resolve, reject) => {
            const cp = childProcess.exec(
                command,
                Object.assign(
                    {
                        cwd: this._workdirPath,
                        env: Object.assign({}, process.env, {PATH: this._mockBinPath})
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
