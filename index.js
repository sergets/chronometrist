const chalk = require('chalk');
const qs = require('querystring');

class Chronometrist {
    constructor(config, req, res) {
        this._config = config || {};
        this._res = res;
        this._req = req;
        this._log = [];
        this._creationTime = Date.now();

        if (this.isEnabled()) {
            req.addListener('end', this.print.bind(this));
        }
    }

    isEnabled() {
        return this._config.enabled === true;
    }

    start(title, opts) {
        if (this.isEnabled()) {
            const logEntry = {
                title,
                opts,
                start: Date.now()
            };
            this._log.push(logEntry);

            return {
                end: () => {
                    logEntry.end = Date.now();
                },
                error: err => {
                    logEntry.err = err;
                    logEntry.end = Date.now();
                }
            };
        }
    }

    print() {
        const {
            enabled,
            logThreshold = 1000,
            screenWidth = 100,
            redThreshold = 500,
            yellowThreshold = 200,
            totalRedThreshold = 1000,
            totalYellowThreshold = 500,
            shouldSkip = () => false,
            getOverallTitle = req => req.path,
            getOverallInfo = () => '',
            filterQuery = () => true,
            roundTo = 1,
            log = console.log.bind(console),
            useColors = true
        } = this._config;

        const MIN_SCALE_SPACE = 10; // Should have enough room for something like "2000 ms" and a little more
        const SCALE_INTERVALS = [20, 50, 100, 200, 500, 1000, 2000];
        const GRID_CHAR = '·';
        const BAR_CHAR = '▇';
        const TICK_CHAR = '|';
        const HR_CHAR = '━';
        const OK_STATUS_CODES = [200, 204];
        const REDIRECT_STATUS_CODES = [301, 302, 304];

        const round = val => Math.round(val / roundTo) * roundTo;

        const now = Date.now();
        const zero = this._creationTime;
        const life = round(now - zero);

        if (!enabled || life < logThreshold || shouldSkip(this._req, this._res)) {
            return;
        }

        const statusCode = this._res.statusCode;

        const scale = life / screenWidth;
        const scaleInterval = SCALE_INTERVALS.filter(interval => interval / scale > MIN_SCALE_SPACE)[0];
        let gridString = '';
        for (let i = scaleInterval; i < life; i += scaleInterval) {
            gridString += fillString(' ', Math.round(i / scale) - Math.round((i - scaleInterval) / scale) - 1) + GRID_CHAR;
        }
        gridString += fillString(' ', screenWidth - gridString.length);

        let n = 0;
        const scaleString = gridString.replace(new RegExp('\\' + GRID_CHAR + ' {0,' + (MIN_SCALE_SPACE - 1) + '}', 'g'), () => {
            const caption = ' ' + (++n * scaleInterval) + ' ms ';

            return TICK_CHAR + caption + fillString(' ', MIN_SCALE_SPACE - 1 - caption.length);
        });

        const overallInfo = getOverallInfo(this._req, this._res);
        const colorize = useColors ?
            (s, color) => chalk[color](s) :
            s => s;
        const printQuery = query => qs.stringify(query).replace(/&/g, colorize('&', 'black'))

        log(fillString(HR_CHAR, screenWidth));
        log(
            'Request summary for ' +
            colorize(getOverallTitle(this._req, this._res), 'bold') + colorize('?', 'black') +
            printQuery(this._req.query) +
            (overallInfo && colorize(' (' + overallInfo + ')', 'gray'))
        );
        log(colorize(scaleString, 'gray'));

        this._log.forEach(event => {
            const eventStart = event.start;
            const eventIsntFinished = event.end === undefined;
            const eventEnd = eventIsntFinished ? Date.now() : event.end;
            const startChar = Math.floor(round(eventStart - zero) / scale);
            const endChar = Math.ceil(round(eventEnd - zero) / scale);
            const length = round(eventEnd - eventStart);

            if (eventIsntFinished && !event.err) {
                event.err = { message: 'Operation still not finished' };
            }

            const eventColor = (length > redThreshold || event.err) ? 'red' :
                length > yellowThreshold ? 'yellow' :
                    'green';

            const opts = event.opts;
            const meaningfulOpts = opts && Object.keys(opts).reduce((res, key) => {
                if (filterQuery(this._req, key, opts[key])) {
                    res[key] = opts[key];
                }
                return res;
            }, {});
            const errorString = event.err ? `[Error: ${event.err.statusCode || event.err.message}]` : '';

            log(
                colorize(gridString.slice(0, startChar), 'gray') +
                colorize(`${fillString(BAR_CHAR, endChar - startChar)} ${length}${eventIsntFinished ? '+' : ''} ms `, eventColor) +
                (errorString && colorize(colorize(errorString, 'underline'), 'red') + ' ') +
                colorize(event.title, 'bold') +
                colorize(meaningfulOpts ? colorize('?', 'black') + printQuery(meaningfulOpts) : '', 'gray')
            );
        });

        const totalColor = (life > totalRedThreshold || !OK_STATUS_CODES.concat(REDIRECT_STATUS_CODES).includes(statusCode)) ? 'red' :
            life > totalYellowThreshold ? 'yellow' :
                'green';
        const mark = OK_STATUS_CODES.includes(statusCode) ? '✓' :
            REDIRECT_STATUS_CODES.includes(statusCode) ? '→' :
                '✗';

        log(
            colorize(gridString.slice(0, screenWidth - 2), 'gray') +
            colorize(`[${colorize(mark, totalColor)}]`, 'bold') +
            colorize(' Complete in ', 'gray') +
            colorize(colorize(`${round(life)} ms`, totalColor), 'bold')
        );

        log(colorize(scaleString, 'gray'));
        log(fillString(HR_CHAR, screenWidth));
    }
}

module.exports = Chronometrist;

function fillString(char, number) {
    if (!number || number < 0) {
        return '';
    }

    return Array.apply(Array, Array(number + 1)).join(char);
}
