# Mock Script Environment

Mock a working dir and commands for service-testing nodejs (or any other) commandline programs.

Service-testing here means something like a unit test, but the "unit" being the whole program instead of a single method.

A test is invoking the program with parameters and prepared files and mocked commands.
After the programs execution, its output, exit code, any created or modified files and called commands are checked to see if the program behaved as expected.

## Setup

### Install

    npm install mock-script-environment --save-dev

### Setup a dockerized test command in package.json

The tests are executed in a docker container to provide some kind of isolation and a repeatable environment.

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

### Specs

Import 'mock-script-environment' and either create and manage an instance yourself or get one with `.getInstance()`.

## Example

Install jasmine (or any other test framework/runner you'd like to use):

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

### The Jasmine spec that tests git-add.js ($PROJECT_DIR/test/git-add.spec.js):

    const ScriptEnv = require('mock-script-environment');

    describe('git-add.js', () => {

        // the mock-script-environment instance, must be the same for all tests
        const scriptEnv = ScriptEnv.getInstance();

        let git;

        beforeEach(() => {

            // set up a mock for the real 'git' command
            git = scriptEnv.mockCommand('git');
        });

        afterEach(() => {

            // reset the environment after each test, deleting files and
            // removing mock commands
            scriptEnv.clear();
        });

        it('should exit with an error if no argument is given', (done) => {

            // run the program
            scriptEnv.exec('git-add.js').then(done.fail).catch((res) => {

                // check that the program exits with an error, printing a message
                // to stdout without trying to call git
                expect(res.exitCode).toBe(1);
                expect(res.stderr).toBe('filename missing');
                expect(git).not.toHaveBeenCalled();
            });
        });

        it('should exit with an error if a filename is given and it does not exist', (done) => {

            // run the program, now with a <filename> parameter
            scriptEnv.exec('git-add.js foo').then(done.fail).catch((res) => {

                // check exitcode, error message and that the program did not
                // attempt to git-add the non-existent file
                expect(res.exitCode).toBe(2);
                expect(res.stderr).toBe('file foo does not exist');
                expect(git).not.toHaveBeenCalled();
            });
        });

        it('should call "git add <filename>" if a filename is given and it exists', (done) => {

            // create the expected file in /test
            scriptEnv.writeFiles({foo: 'foo-content'});

            // run the program
            scriptEnv.exec('git-add.js foo').then((done) => {

                // check that it called git with the correct params
                expect(git).toHaveBeenCalledWith({
                    args: ['add', 'foo']
                });

                // and the expected output
                expect(res.stdout).toBe('added');
            }).catch(done.fail);
        });
    })

## More examples

Check mock-script-environments own tests in `test/methods.spec.js`.
