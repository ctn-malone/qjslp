Line processing utility using Javascript as a proof of concept

Requires [QuickJS](https://github.com/ctn-malone/quickjs-cross-compiler/releases/tag/2020-11-08_3%2Bext-lib-0.1.0) for compilation

# Compile

```
cd src
qjsc.sh -o qjslp qjslp.js
```

# Usage

```
qjslp -h
Line processing utility using Javascript (0.1.0)
Usage: qjslp [-h|--help] [-c,--code] [-b,--begin] [-e|--end] [-q|--quiet] [-d|--debug] [--debug-store]
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
```

Inside a `code` section

* if function returns `undefined`, `null` or `false` line will be ignored
* if function returns something which is not a *string* or a *number*, input line will keep its value
* if `$_` is assigned a new value, input line will have this new value

Following function are provided as helper in `begin`, `end` and `code` sections

* $p : print to *stdout*
* $e : print to *stderr*

Following shortcuts are also provided in `code` sections

* `$_!.{fn}` => `$_ = $_.{fn}` (example: `$_!.toUpperCase()` => `$_ = $_.toUpperCase()`)

# Examples

<u>NB</u> : a better alternative is likely to exist using common unix tools ;)

* print the number of entries for each state in file `01.csv`, in JSON format
  * initialize `counter` object in store
  * for each line
    * ignore if line is first one (header)
    * store current state in store
    * initialize counter for current state if needed
    * increase counter for current state
  * print `counter` object

```
cat 01.csv | qjslp -q \
    -b '$$.count = {}' \
    -c 'return $i > 0' \
    -c '$$.state = $_.split(",")[9].trim()' \
    -c '$$.count[$$.state] ||= 0' \
    -c '++$$.count[$$.state]' \
    -e '$p(JSON.stringify($$.count))'
```

* convert `01.csv` to JSON format
  * initialize `entries` array in store
  * for each line
    * remove `"`
    * if line is first one (header), split line and store result in store
    * split line, build a JS object and add it to the `entries` array
  * print `entries` object

```
cat 01.csv | qjslp -q \
    -b '$$.entries = []' \
    -c '$_!.replace(/"/g, "")' \
    -c 'if ($i == 0) { $$.fields = $_.split(",").map(e => e.trim()) ; return false }' \
    -c 'entry = {} ; $_.split(",").forEach((e, i) => entry[$$.fields[i]] = e.trim()) ; $$.entries.push(entry)' \
    -e '$p(JSON.stringify($$.entries))'
```

* extract `server` section from `02.ini`
  * enable `ignore` flag in store
  * for each line
    * if `[server]` section is starting, disable `ignore` flag
    * if another section is starting, enable `ignore` flag

```
cat 02.ini | qjslp \
    -b '$$.ignore = true' \
    -c 'if ($_.startsWith("[")) { $$.ignore = ($_ != "[server]") } ; return !$$.ignore'
```

* split lines in `03.csv` based on sex
  * for each line
    * ignore if line is first one
    * if second field contains `F`, write line to *stdout*
    * otherwise write line to *stderr*

```
cat 03.csv | qjslp -q \
    -c 'return $i > 0' \
    -c '$_.split(",")[1].trim() == "\"F\"" ? $p($_) : $e($_)' \
    >/tmp/F.csv 2>/tmp/M.csv
```