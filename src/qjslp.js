import * as std from 'std';
import * as os from 'os';
import arg from 'ext/arg.js';
import { getScriptName } from 'ext/path.js';

/*
    Simple line processor to be used in pipelines (proof of concept)

    In line processing code
    
        - $_ is current line
        - $$ is global store
        - $i is the 0-based index of current line
      
        If function returns {undefined}, {null} or {false} line will be ignored
        If function returns something which is not a string or a number, input line will keep its value
        If {$_} is assigned a new value, input line will have this new value

        When using $_!.{fn}, code will be replaced with $_ = $_.{fn}
        
        Example

            $_!.toUpperCase() => $_ = $_.toUpperCase()
        
        When using multiple -c arguments, they will be processed in the order the were defined

        If no -c argument is given, input line will be printed (unless -q was used)

    In begin & end code

        - $$ is global store
    
    In end code

        - $c is the number of lines which were processed
    
    In all functions

        - $p is an helper function which prints to stdout (\n is added)
        - $e is an helper function which prints to stderr (\n is added)
 */

const VERSION = '0.1.0';

const getUsage = () => {
    const message = `
Usage: ${getScriptName()} [-h|--help] [-c,--code] [-b,--begin] [-e|--end] [-q|--quiet] [-d|--debug] [--debug-store]
    -c  --code:     code to execute for each line ($_ is the current line, $$ is the global store object,
                    $i is the 0-based index of current line)
                    Can be specified multiple times
    -b, --begin:    code to execute before processing lines ($$ is the global store object)
    -e, --end:      code to execute after all lines have been processed ($$ is the global store object,
                    $c is the number of lines which were processed)
    -q, --quiet:    if used, input lines will never be printed
    -d, --debug:    print debug information during processing (implies -q)
    --debug-store:  print store whenever a store value has changed (ignored if -d is not set)
    -h, --help:     print help
`.trim();
    return message;
}

const getHelp = () => {
    const message = `
Line processing utility using Javascript (${VERSION})
`.trim();
    return `${message}\n${getUsage()}`;
}

// list of functions used to process lines;
globalThis._lineProcessingFn = [];
globalThis.$p = (...args) => { std.out.puts(`${args.join(' ')}\n`) };
globalThis.$e = (...args) => { std.err.puts(`${args.join(' ')}\n`) };

let args;
try {
    args = arg({
        '--begin': (v, n, p) => {
            const value = v.trim();
            if ('' != value) {
                const beginFn = `function _begin($$) { ${value} }`;
                try {
                    std.evalScript(beginFn);
                }
                catch (e) {
                    const err = new Error(`Begin code cannot not be evaluated: ${e.message.trim()}`);
                    err.code = 'ARG_INVALID_OPTION';
                    throw err;
                }
            }
            return value;
        },
        '--end': (v, n, p) => {
            const value = v.trim();
            if ('' != value) {
                const endFn = `function _end($$, $c) { ${value} }`;
                try {
                    std.evalScript(endFn);
                }
                catch (e) {
                    const err = new Error(`End code cannot not be evaluated: ${e.message.trim()}`);
                    err.code = 'ARG_INVALID_OPTION';
                    throw err;
                }
            }
            return value;
        },
        '--code': (v, n, p) => {
            let value = v.trim();
            value = value.replace(/\$_!/g, '$_ = $_');
            const index = globalThis._lineProcessingFn.length;
            if ('' != value) {
                globalThis._lineProcessingFn.push({str:value});
                const str = `globalThis._lineProcessingFn[${index}].fn = function ($_, $$, $i) { ${value} ; return $_ }`;
                try {
                    std.evalScript(str);
                }
                catch (e) {
                    const err = new Error(`Line processing code #${index + 1} (${value}) cannot not be evaluated: ${e.message.trim()}`);
                    err.code = 'ARG_INVALID_OPTION';
                    throw err;
                }
            }
            return value;
        },
        '--help': Boolean,
        '--quiet': Boolean,
        '--debug': Boolean,
        '--debug-store': Boolean,
        // aliases
        '-h': '--help',
        '-c': '--code',
        '-b': '--begin',
        '-e': '--end',
        '-q': '--quiet',
        '-d': '--debug'
    });
}
catch (e) {
    switch (e.code) {
        case 'ARG_UNKNOWN_OPTION':
        case 'ARG_INVALID_OPTION':            
        case 'ARG_MISSING_REQUIRED_SHORTARG':
        case 'ARG_MISSING_REQUIRED_LONGARG':
            std.err.printf(`${e.message.trim()}\n`);
            std.err.printf(`${getUsage()}\n`);
            std.exit(2);
    }
    throw e;
}
if (args['--help']) {
    std.err.printf(`${getHelp()}\n`);
    std.exit(2);
}
if (args['--debug']) {
    args['--quiet'] = true;
}
else if (args['--debug-store']) {
    args['--debug-store'] = false;
}

// store available in begin code, line processing code & end code
const store = {};
let prevStore;

// execute begin code
if ('function' == typeof _begin) {
    if (args['--debug']) {
        std.err.printf(`[begin]\n`);
        std.err.flush();
    }
    try {
        _begin(store);
    }
    catch (e) {
        std.err.printf(`Begin code failed: ${e.message.trim()}\n`);
        std.exit(1);
    }
    if (args['--debug']) {
        std.err.printf(`[/begin]\n`);
        std.err.printf(`${JSON.stringify(store, null, 2)}\n`);
        std.err.flush();
    }
}

let inLine;
let outLine;
let lineNumber = 1;
let tmpOutline;
let ignoreLine = false;
let shouldBreak = false;
while (null !== (inLine = std.in.getline())) {
    outLine = inLine;
    ignoreLine = false;
    shouldBreak = false;
    if (args['--debug']) {
        std.err.printf(`[line #${lineNumber}]\n`);
        std.err.printf(`  in: ${JSON.stringify(inLine)}\n`);
        std.err.flush();
    }
    // call each line processing function
    for (let i = 0; i < globalThis._lineProcessingFn.length; ++i) {
        if (args['--debug']) {
            std.err.printf(`  [func #${i + 1}]\n`);
            std.err.printf(`    in:  ${JSON.stringify(outLine)}\n`);
            std.err.flush();
            if (args['--debug-store']) {
                prevStore = JSON.stringify(store);
            }
        }
        try {
            tmpOutline = globalThis._lineProcessingFn[i].fn(outLine, store, lineNumber - 1);
        }
        catch (e) {
            std.err.printf(`Line processing code #${i + 1} (${globalThis._lineProcessingFn[i].str}) failed when processing line #${lineNumber} (line will be printed below): ${e.message.trim()}\n`);
            std.err.printf(`  ${JSON.stringify(outLine)}\n`);
            std.err.printf(`Initial line will be printed below\n`);
            std.err.printf(`  ${JSON.stringify(inLine)}\n`);
            std.exit(1);
        }
        // we didn't receive a string or a number
        if ('string' != typeof tmpOutline && 'number' != typeof tmpOutline) {
            // filter line if result is {undefined}, {null} or {false}
            if (undefined == tmpOutline || null === tmpOutline || false === tmpOutline) {
                outLine = tmpOutline;
                ignoreLine = true;
                if (args['--debug']) {
                    std.err.printf(`    out: IGNORED\n`);
                    std.err.printf(`  [/func #${i + 1}]\n`);
                    std.err.flush();
                }
                shouldBreak = true;
            }
            else {
                if (args['--debug']) {
                    std.err.printf(`    out: ${JSON.stringify(outLine)}\n`);
                    std.err.printf(`  [/func #${i + 1}]\n`);
                    std.err.flush();
                }
            }
        }
        else {
            // update outLine for next line processing function
            outLine = tmpOutline;
            if (args['--debug']) {
                std.err.printf(`    out: ${JSON.stringify(outLine)}\n`);
                std.err.printf(`  [/func #${i + 1}]\n`);
                std.err.flush();
            }
        }
        if (args['--debug-store']) {
            const newStore = JSON.stringify(store);
            if (newStore != prevStore) {
                std.err.printf(`${JSON.stringify(store, null, 2)}\n`);
                std.err.flush();
            }
        }
        if (shouldBreak) {
            break;
        }
    }
    if (!ignoreLine) {
        if (!args['--quiet']) {
            // if true, output what we received on stdin
            if (true === outLine) {
                std.out.puts(`${inLine}\n`);
            }
            // output what was returned by function
            else {
                std.out.puts(`${outLine}\n`);
            }
            std.out.flush();
        }
        if (args['--debug']) {
            std.err.printf(`  out: ${JSON.stringify(outLine)}\n`);
            std.err.printf(`[/line #${lineNumber}]\n`);
            std.err.flush();
        }
    }
    else {
        if (args['--debug']) {
            std.err.printf(`  out: IGNORED\n`);
            std.err.printf(`[/line #${lineNumber}]\n`);
            std.err.flush();
        }
    }
    ++lineNumber;
}

// execute end code
if ('function' == typeof _end) {
    if (args['--debug']) {
        std.err.printf(`[end]\n`);
        std.err.flush();
    }
    try {
        _end(store, lineNumber - 1);
    }
    catch (e) {
        std.err.printf(`End code failed: ${e.message.trim()}\n`);
        std.exit(1);
    }
    if (args['--debug']) {
        std.err.printf(`[/end]\n`);
        std.err.printf(`${JSON.stringify(store, null, 2)}\n`);
        std.err.flush();
    }
}
