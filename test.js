const Chronometrist = require('./index');

require('chai').should();

function testChronometrist(config, req, res, actions, expectedResult) {
    return new Promise((resolve, reject) => {
        const output = [];
        let onEnd;
        req.addListener = (e, listener) => {
            if (e === 'end') {
                onEnd = () => {
                    listener();
                    output.should.deep.equal(expectedResult);
                    resolve(true);
                };
            }
        };
        const chronometrist = new Chronometrist(Object.assign({
            enabled: true,
            log: string => output.push(string)
        }, config), req, res);

        Object.keys(actions).forEach(key => setTimeout(() => actions[key](chronometrist), key));
        setTimeout(onEnd, Math.max.apply(Math, Object.keys(actions)));
    });
}

describe('chronometrist', () => {
    it('should work as expected', () => {
        let h1, h2, h3;

        return testChronometrist(
            {
                logThreshold: 350,
                screenWidth: 60,
                roundTo: 50,
                useColors: false
            },
            { path: '/path/', query: { foo: 'bar' } },
            { statusCode: 200 },
            {
                50: chronometrist => { h1 = chronometrist.start('successful') },
                100: chronometrist => { h2 = chronometrist.start('successful', { a: 1, b: 2 }) },
                150: () => { h2.end() },
                200: chronometrist => { chronometrist.start('stale') },
                250: () => { h1.end() },
                300: chronometrist => { h3 = chronometrist.start('errored', { a: 1, b: 2 }) },
                350: () => { h3.error({ statusCode: 404 }) },
                400: () => {}
            },
            [
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'Request summary for /path/?foo=bar',
                '              | 100 ms       | 200 ms       | 300 ms        ',
                '       ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 200 ms successful',
                '              ·▇▇▇▇▇▇▇▇ 50 ms successful?a=1&b=2',
                '              ·              ·▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 200+ ms [Error: Operation still not finished] stale',
                '              ·              ·              ·▇▇▇▇▇▇▇▇ 50 ms [Error: 404] errored?a=1&b=2',
                '              ·              ·              ·             [✓] Complete in 400 ms',
                '              | 100 ms       | 200 ms       | 300 ms        ',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            ]
        );
    });

    it('should show up only when exceeding logThreshold and is not skipped', () => {
        const config = {
            logThreshold: 200,
            screenWidth: 60,
            roundTo: 50,
            shouldSkip: (req, res) => res.statusCode === 403,
            useColors: false
        };
        const req = { path: '/path/', query: {} };

        return Promise.all([
            testChronometrist(config, req, { statusCode: 200 },
                {
                    50: () => {}
                },
                []
            ),

            testChronometrist(config, req, { statusCode: 200 },
                {
                    250: () => {}
                },
                [
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    'Request summary for /path/?',
                    '           | 50 ms     | 100 ms    | 150 ms    | 200 ms     ',
                    '           ·           ·           ·           ·          [✓] Complete in 250 ms',
                    '           | 50 ms     | 100 ms    | 150 ms    | 200 ms     ',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                ]
            ),

            testChronometrist(config, req, { statusCode: 403 },
                {
                    250: () => {}
                },
                []
            ),

            testChronometrist(config, req, { statusCode: 404 },
                {
                    250: () => {}
                },
                [
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    'Request summary for /path/?',
                    '           | 50 ms     | 100 ms    | 150 ms    | 200 ms     ',
                    '           ·           ·           ·           ·          [✗] Complete in 250 ms',
                    '           | 50 ms     | 100 ms    | 150 ms    | 200 ms     ',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                ]
            )
        ]);
    });

    it('should allow to override overall title, info and filter queries', () => {
        const config = {
            logThreshold: 50,
            screenWidth: 60,
            roundTo: 50,
            getOverallTitle: (req, res) => `PATH ${req.path} RESULTED ${res.statusCode} `,
            getOverallInfo: (req, res) => `Common: ${req.commonQuery.common}`,
            filterQuery: (req, key, val) => req.commonQuery[key] !== val,
            useColors: false
        };
        const req = { path: '/path/', query: {}, commonQuery: { common: 'everywhere' } };
        const res = { statusCode: 200 };

        let h1, h2;

        return Promise.all([
            testChronometrist(config, req, res,
                {
                    50: chronometrist => { h1 = chronometrist.start('successful', { a: 1, common: 'everywhere' }) },
                    100: chronometrist => { h2 = chronometrist.start('successful', { b: 2, common: 'everywhere' }) },
                    150: () => { h1.end() },
                    200: () => { h2.end() },
                },
                [
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    'Request summary for PATH /path/ RESULTED 200 ? (Common: everywhere)',
                    '              | 50 ms        | 100 ms       | 150 ms        ',
                    '              ·▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 100 ms successful?a=1',
                    '              ·              ·▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 100 ms successful?b=2',
                    '              ·              ·              ·             [✓] Complete in 200 ms',
                    '              | 50 ms        | 100 ms       | 150 ms        ',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
                ]
            )
        ]);
    });
});
