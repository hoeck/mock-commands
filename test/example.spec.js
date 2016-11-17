const fs = require('fs');

const MockScriptEnvironment = require('..');

describe('mock-script-environment', () => {
    const scriptEnv = new MockScriptEnvironment({path: '/test'});

    describe('".prepareFiles"', () => {
        afterEach(() => {
            scriptEnv.clear();
        });

        it('should write the specified files to "/test/workdir"', () => {
            scriptEnv.prepareFiles({'foo.txt': 'a\nb\n', 'bar.txt': '123'});

            expect(fs.readFileSync('/test/workdir/foo.txt').toString()).toBe('a\nb\n');
        });
    });
});
