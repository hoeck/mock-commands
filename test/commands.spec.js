const childProcess = require('child_process');
const fs = require('fs');
const process = require('process');

const MockCommands = require('..');

describe('module', () => {
    let mockCommands;

    function exec (command) {
        return new Promise((resolve, reject) => {
            const proc = childProcess.exec(command, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });

            proc.stderr.on('data', (data) => {
                console.log(data);
            });
        });
    }

    beforeAll(() => {
        mockCommands = new MockCommands({mockCommandPath: '/mock-commands'});
    });

    beforeEach(() => {
        mockCommands.clear();
    });

    describe('test setup', () => {
        it('should have the proper PATH', () => {
            expect(process.env.PATH).toMatch(/^\/mock-commands/);
        });

        it('should execute shell commands asynchronously', (done) => {
            exec(`echo 'foo'`)
                .then((res) => {
                    expect(res.trim()).toEqual('foo');
                    done();
                })
                .catch(done.fail);
        });
    });

    describe('mock-commands', () => {
        it('should set up mock commands', (done) => {
            const ls = mockCommands.mock('ls').and.returnValue('mocked-ls');

            expect(fs.existsSync('/mock-commands/ls')).toBe(true);

            exec('ls').then((res) => {
                expect(res).toBe('mocked-ls');
                expect(ls).toHaveBeenCalledWith({args: []});

                done();
            });
        });

        it('should reset mock commands between tests', () => {
            expect(fs.existsSync('/mock-commands/ls')).toBe(false);
        });

        it('should pass arguments to the mock command spy', (done) => {
            const foo = mockCommands.mock('foo').and.returnValue('bar');

            exec('foo --bar --baz 123 "4 5 6"').then((res) => {
                expect(res).toBe('bar');
                expect(foo).toHaveBeenCalledWith({args: ['--bar', '--baz', '123', '4 5 6']});

                done();
            });
        });
    });
});
