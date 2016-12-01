const fs = require('fs');

const MockScriptEnvironment = require('..');

describe('mock-script-environment', () => {
    const scriptEnv = new MockScriptEnvironment({path: '/test'});

    describe('method "getWorkDir"', () => {
        it('should return the working directory', () => {
            expect(scriptEnv.getWorkdir()).toBe('/test/workdir');
        });
    });

    describe('method "createFiles"', () => {
        const workdir = scriptEnv.getWorkdir();

        afterEach(() => {
            scriptEnv.clear();
        });

        it('should write the specified files to the working directory', () => {
            scriptEnv.createFiles({'foo.txt': 'a\nb\n', 'bar.txt': '123'});

            expect(fs.readFileSync(`${workdir}/foo.txt`).toString()).toBe('a\nb\n');
            expect(fs.readdirSync(`${workdir}`)).toEqual(['bar.txt', 'foo.txt']);
        });

        it('should be able to create files in nested directories', () => {
            scriptEnv.createFiles({'foo/bar': '1', 'foo/foo/bar': '2'});

            expect(fs.readFileSync(`${workdir}/foo/bar`).toString()).toBe('1');
            expect(fs.readFileSync(`${workdir}/foo/foo/bar`).toString()).toBe('2');
        });

        it('should be idempotent', () => {
            scriptEnv.createFiles({foo: '1', baz: '2'});
            scriptEnv.createFiles({foo: '1', bar: '3'});

            expect(fs.readFileSync(`${workdir}/foo`).toString()).toBe('1');
            expect(fs.readFileSync(`${workdir}/bar`).toString()).toBe('3');
            expect(fs.readFileSync(`${workdir}/baz`).toString()).toBe('2');

            expect(fs.readdirSync(workdir)).toEqual(['bar', 'baz', 'foo']);
        });
    });

    describe('method "exec"', () => {
        afterEach(() => {
            scriptEnv.clear();
        });

        it('should execute any command, returning a promise with the commands results', (done) => {
            scriptEnv.exec('echo -n "foo"').then((res) => {
                expect(res.stdout).toBe('foo');
                expect(res.stderr).toBe('');
                expect(res.exitCode).toBe(0);

                done();
            }).catch(done.fail);
        });

        it('should execute any command in "workdir"', (done) => {
            scriptEnv.exec('echo -n $PWD').then((res) => {
                expect(res.stdout).toBe(scriptEnv.getWorkdir());

                done();
            }).catch(done.fail);
        });

        it('should execute any command with a PATH that includes mocked commands', (done) => {
            scriptEnv.mockCommand('mock-command', () => {});

            scriptEnv.exec('which mock-command').then(done).catch(done.fail);
        });
    });

    describe('method "mockCommand"', () => {
        afterEach(() => {
            scriptEnv.clear();
        });

        it('should setup an executable script using the given spy', (done) => {
            scriptEnv.mockCommand('foo', () => 'foo-stdout');

            scriptEnv.exec('foo').then((res) => {
                expect(res.stdout).toBe('foo-stdout');
                expect(res.stderr).toBe('');
                expect(res.exitCode).toBe(0);

                done();
            }).catch(done.fail);
        });

        it('should provide an extended API to control return codes and stderr output', (done) => {
            scriptEnv.mockCommand('foo', () => ({
                stdout: 'foo-stdout',
                stderr: 'foo-stderr',
                exitCode: 13
            }));

            scriptEnv.exec('foo').then(done.fail).catch((err) => {
                expect(err.exitCode).toBe(13);
                expect(err.stdout).toBe('foo-stdout');
                expect(err.stderr).toBe('foo-stderr');

                done();
            });
        });

        it('should pass the commands arguments to the mock function as "args"', (done) => {
            let commandArgs;

            scriptEnv.mockCommand('foo', (args) => {
                commandArgs = args;
                return 'foo';
            });

            scriptEnv.exec('foo -a --bar "123" ABC').then((res) => {
                expect(res.stdout).toBe('foo');
                expect(commandArgs).toEqual({args: ['-a', '--bar', '123', 'ABC']});

                done();
            }).catch(done.fail);
        });

        it('should create and return a jasmine spy when no mock function is passed', (done) => {
            const spy = scriptEnv.mockCommand('foo').and.returnValue('foo');

            expect(spy).toEqual(jasmine.any(Function));

            scriptEnv.exec('foo --bar').then((res) => {
                expect(res.stdout).toBe('foo');
                expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({args: ['--bar']}));

                done();
            }).catch(done.fail);
        });
    });

    describe('method "clear"', () => {
        it('should delete everything in the work dir', () => {
            scriptEnv.createFiles({foo: 'bar'});
            scriptEnv.clear();

            expect(fs.existsSync(scriptEnv.getWorkdir())).toBe(true);
            expect(fs.readdirSync(scriptEnv.getWorkdir())).toEqual([]);
        });

        it('should delete everything in the bin dir', () => {
            scriptEnv.mockCommand('foo', () => { });
            scriptEnv.clear();

            expect(fs.existsSync('/test/bin')).toBe(false);
        });

        it('should reset all mock commands', () => {
            scriptEnv.mockCommand('foo', () => { });

            // redefinition of foo throws an error
            expect(() => {
                scriptEnv.mockCommand('foo', () => { });
            }).toThrow();

            scriptEnv.clear();

            // now that all commands are cleared, redefinition of foo must be
            // possible again
            expect(() => {
                scriptEnv.mockCommand('foo', () => { });
            }).not.toThrow();
        });

    });
});
