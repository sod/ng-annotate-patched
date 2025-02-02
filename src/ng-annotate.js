// ng-annotate.js
// MIT licensed, see LICENSE file
// Copyright (c) 2013-2016 Olov Lassus <olov.lassus@gmail.com>

"use strict";

const t0 = Date.now();
const fs = require("fs");
const ngAnnotate = require("./ng-annotate-main");
const version = require("../package.json").version;
const optimist = require("optimist")
    .usage("ng-annotate v" + version + "\n\nUsage: ng-annotate OPTIONS <file>\n\n" +
        "provide - instead of <file> to read from stdin\n" +
        "use -a and -r together to remove and add (rebuild) annotations in one go")
    .options("a", {
        alias: "add",
        boolean: true,
        describe: "add dependency injection annotations where non-existing",
    })
    .options("r", {
        alias: "remove",
        boolean: true,
        describe: "remove all existing dependency injection annotations",
    })
    .options("o", {
        describe: "write output to <file>. output is written to stdout by default",
    })
    .options("sourcemap", {
        boolean: true,
        describe: "generate an inline sourcemap"
    })
    .options("sourceroot", {
        describe: "set the sourceRoot property of the generated sourcemap"
    })
    .options("single_quotes", {
        boolean: true,
        describe: "use single quotes (') instead of double quotes (\")",
    })
    .options("regexp", {
        describe: "detect short form myMod.controller(...) iff myMod matches regexp",
    })
    .options("rename", {
        describe: "rename declarations and annotated references\n" +
            "oldname1 newname1 oldname2 newname2 ...",
        default: ""
    })
    .options("plugin", {
        describe: "use plugin with path (experimental)",
    })
    .options("enable", {
        describe: "enable optional with name",
    })
    .options("list", {
        describe: "list all optional names",
        boolean: true,
    })
    .options("stats", {
        boolean: true,
        describe: "print statistics on stderr (experimental)",
    });

const argv = optimist.argv;

function exit(msg) {
    if (msg) {
        process.stderr.write(msg);
        process.stderr.write("\n");
    }
    process.exit(-1);
}

// special-case for --list
if (argv.list) {
    const list = ngAnnotate("", {list: true}).list;
    if (list.length >= 1) {
        process.stdout.write(list.join("\n") + "\n");
    }
    process.exit(0);
}

// validate options
if (argv._.length !== 1) {
    optimist.showHelp();
    exit("error: no input file provided");
}

if (!argv.add && !argv.remove) {
    optimist.showHelp();
    exit("error: missing option --add and/or --remove");
}

const filename = argv._.shift();

(filename === "-" ? slurpStdin : slurpFile)(runAnnotate);


function slurpStdin(cb) {
    let buf = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function(d) {
        buf += d;
    });
    process.stdin.on("end", function() {
        cb(null, buf);
    });
    process.stdin.resume();
}

function slurpFile(cb) {
    if (!fs.existsSync(filename)) {
        cb(new Error(`error: file not found ${filename}`));
    }

    fs.readFile(filename, cb);
}

function runAnnotate(err, src) {
    if (err) {
        exit(err.message);
    }

    src = String(src);

    let config;
    try {
        config = JSON.parse(String(fs.readFileSync("ng-annotate-config.json")));
    } catch (e) {
        config = {};
    }

    if (filename !== "-") {
        config.inFile = filename;
    }

    ["add", "remove", "o", "regexp", "rename", "single_quotes", "plugin", "enable", "stats"].forEach(function(opt) {
        if (opt in argv) {
            config[opt] = argv[opt];
        }
    });

    if (argv.sourcemap) {
        config.map = { inline: true, sourceRoot: argv.sourceroot };
        if (filename !== "-") {
            config.map.inFile = filename;
        }
    };

    if (config.enable && !Array.isArray(config.enable)) {
        config.enable = [config.enable];
    }

    if (config.plugin) {
        if (!Array.isArray(config.plugin)) {
            config.plugin = [config.plugin];
        }
        config.plugin = config.plugin.map(function(path) {
            let absPath;
            try {
                absPath = fs.realpathSync.bind(fs, path);
            } catch (e) {
                absPath = null;
            }
            if (!absPath) {
                exit(`error: plugin file not found ${path}`);
            }
            // the require below may throw an exception on parse-error
            try {
                return require(absPath);
            } catch (e) {
                // node will already print file:line and offending line to stderr
                exit(`error: couldn't require("${absPath}")`);
            }
        });
    }

    const trimmedRename = config.rename && config.rename.trim();
    if (trimmedRename) {
        const flattenRename = trimmedRename.split(" ");
        const renameArray = [];
        for (let i = 0; i < flattenRename.length; i = i + 2) {
            renameArray.push({
                "from": flattenRename[i],
                "to": flattenRename[i + 1],
            });
        }
        config.rename = renameArray;
    } else {
        config.rename = null;
    }

    const run_t0 = Date.now();
    const ret = ngAnnotate(src, config);
    const run_t1 = Date.now();

    if (ret.errors) {
        exit(ret.errors.join("\n"));
    }

    const stats = ret._stats;
    if (config.stats && stats) {
        const t1 = Date.now();
        const all = t1 - t0;
        const run_parser = stats.parser_parse_t1 - stats.parser_parse_t0;
        const all_parser = run_parser + (stats.parser_require_t1 - stats.parser_require_t0);
        const nga_run = (run_t1 - run_t0) - run_parser;
        const nga_init = all - all_parser - nga_run;

        const pct = function(n) {
            return Math.round(100 * n / all);
        }

        process.stderr.write(`[${all} ms] parser: ${all_parser}, nga init: ${nga_init}, nga run: ${nga_run}\n`);
        process.stderr.write(`[%] parser: ${pct(all_parser)}, nga init: ${pct(nga_init)}, nga run: ${pct(nga_run)}\n`);
    }

    if (ret.src && config.o) {
        try {
            fs.writeFileSync(config.o, ret.src);
        } catch (e) {
            exit(e.message);
        }
    } else if (ret.src) {
        process.stdout.write(ret.src);
    }
}
