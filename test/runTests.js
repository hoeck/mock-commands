const assert = require('assert');
const process = require('process');

const Jasmine = require('jasmine');
const SpecReporter = require('jasmine-spec-reporter');

function runTests () {
    assert(process.env.DOCKER === 'yes', 'not running inside docker');

    const jasmineRunner = new Jasmine();

    jasmine.getEnv().clearReporters();
    jasmineRunner.addReporter(new SpecReporter());

    jasmineRunner.loadConfig({
        spec_dir: './test',
        spec_files: [
            '*.spec.js'
        ]
    });

    jasmineRunner.onComplete((success) => {
        process.exit(success ? 0 : 1);
    });

    jasmineRunner.execute();
}

runTests();
