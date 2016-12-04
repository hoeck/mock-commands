# Mock Script Environment

Mock a working dir and commands for service-testing nodejs (or any other) commandline programs.

## Usage

### Install

    npm install mock-script-environment --save-dev

### Setup a dockerized test command in package.json

The tests are executed in docker to provide some kind of isolation and a repeatable environment.

They also run without a docker container given that some basic shell commands (`find`, `mkdir -p`, `rm -rf`) are available.

    "scripts": {
        "test": "docker run --tty --rm --tmpfs /test:exec --volume $PWD:/project --workdir /project node:6-slim node_modules/.bin/jasmine"
    }

#### Docker arguments:

* `--tty` docker allocates a pseudo terminal -> terminal colors
* `--rm` remove the docker container after the tests are done
* `--tmpfs /test:exec` run the tests in a temp-filesystem (no real writes on the harddrive) and allow files in /test to be executed
* `--volume $PWD:/project` provide the to-be-tested script and tests inside docker
* `--workdir /project` working directory must be set to the project root for everything to work

## Example

Install jasmine (or any other test framework/runner you'd like to use)

    npm install jasmine --save-dev

### The script to test ($PROJECT_DIR/git-add.js)

    #!/bin/env node

    const fs = require('fs');
    const childProcess('child_process');

    const filename = process.argv[1];

    if (!filename) {
        console.error('filename missing');
        process.exit(1);
    }

    if (!fs.existsSync(filename)) {
        console.error(`file ${filename} does not exist`);
        process.exit(2);
    }

    childProcess.execFileSync('git', ['add', filename]);
    console.log('added');

### The Jasmine spec ($PROJECT_DIR/test/git-add.spec.js):

    const ScriptEnv = require('mock-script-environment');

    describe('git-add.js', () => {
        const scriptEnv = ScriptEnv.getInstance();

        let git;

        beforeEach(() => {
            git = scriptEnv.mockCommand('git');
        });

        afterEach(() => {
            scriptEnv.clear();
        });

        it('should exit with an error if no argument is given', (done) => {
            scriptEnv.exec('git-add.js').then(done.fail).catch((res) => {
                expect(res.exitCode).toBe(1);
                expect(res.stderr).toBe('filename missing');
                expect(git).not.toHaveBeenCalled();
            });
        });

        it('should exit with an error if a filename is given and it does not exist', (done) => {
            scriptEnv.exec('git-add.js foo').then(done.fail).catch((res) => {
                expect(res.exitCode).toBe(2);
                expect(res.stderr).toBe('file foo does not exist');
                expect(git).not.toHaveBeenCalled();
            });
        });

        it('should call "git add <filename>" if a filename is given and it exists', (done) => {
            scriptEnv.exec('git-add.js foo').then(done.fail).catch((res) => {
                expect(git).toHaveBeenCalledWith({
                    args: ['add', 'foo']
                });
                expect(res.stdout).toBe('added');
            });
        });
    })

## More examples

Check mock-script-environments own tests in `test/methods.spec.js`.
