// The usage text. It lists every command the CLI answers to; a command missing here is a documentation bug.
export const USAGE = `ssa-archive <command> [options]

Disc and archives
  identify --game <wbfs>
  disc-list --game <wbfs> [--filter <regex>]
  disc-extract --game <wbfs> --path <disc path> --out <dir>
  info <archive>
  list <archive>
  extract <archive> --out <workspace dir> [--disc-path <path>] [--decode]
  verify <archive|workspace>
  rebuild <workspace dir> --out <archive> [--replace <index>=<file>]... [--reencode-all] [--layout <name>] [--pad <units>]
  diff <original> <rebuilt>
  patch --experiment <id> --game <wbfs> --replace <disc path>=<file>... --out <patch dir> [--force]

Raw file analysis
  scan floats <file> [--range min,max] [--vector 2|3|4|16] [--endian le|be|both] [--limit <n>]
  scan strings <file> [--min 6] [--filter <regex>] [--limit <n>]
  scan identifiers <file> [--min 4] [--limit <n>]
  bindiff <a> <b> [--context 16] [--limit <n>]

Decoded level entries (IGZ)
  igz sections|types|objects <file> [--histogram] [--type <name>] [--out <graph.json>]
  igz show <file> <offset>
  igz near <file> <x> <y> <z> [--tol 3] [--dimensions]
  igz match <file> --address <ram address> | --pattern <hex> [--base <address>]
  igz refs <file> <offset> [--depth <n>]
  igz containers <file> [--type <name>]      igz members <file> <offset>      igz fields <file>
  igz models <file> [--fixups <map>] [--validate]
  igz placements <file> --fixups <map> [--layer <name>] [--near x,z,radius] [--all]
  igz scripts <file> [--fixups <map>]        igz script <file> <offset> [--fixups <map>] [--limit <n>]
  igz fixups <file> <resident dump> [--base <address>] [--regions <mem1>,<mem2>] [--section-address <i>=<addr>]... [--out <map>]
  igz clone <file> <offset> --finding <id> --out <file> [--set <hex>[:type]=<value>]... [--plan <json>]
  igz clone-entity <file> <offset> --end <offset> --finding <id> --fixups <map> --out <file>
        [--replace-record <victim> [--keep <hex,hex>]] | [--replace-node <victim|next>] | [--link-after <offset>]
        | [--overwrite <offset>] | [--insert-before <offset>] [--set ...] [--plan <json>]
  igz pick-overwrite-target <file> <offset> --end <offset> --type <n> --fixups <map>
  igz relocation-probe <file> --fixups <map> [--section <n>] [--out <json>]

Placement editor
  edit levels
  edit open <level name | disc path> [--fixups <map>] [--game <wbfs>] [--port 7378] [--open]
  edit list <level> --fixups <map> [--layer <name>] [--near x,z,radius] [--all]
  edit show <level> <offset> --fixups <map>
  edit set <level> <offset> --fixups <map> --out <file> [--pos x,y,z] [--heading <deg>] [--scale <n>] [--plan <json>]
  edit replace <level> <source> --over <victim> --fixups <map> --out <file> [--pos x,y,z] [--keep auto|<hex,hex>]
  edit serve <level> --archive <disc path> --entry <i> [--fixups <map>] [--port 7378] [--open]
  edit preview <level> --archive <disc path> --entry <i> [--fixups <map>] [--out <png>] [--meshes]

Experiments (dedicated Dolphin, driven over MCP)
  experiment m1 --archive <disc path> [--figure <.sky>] [--script <json>] [--skip-control]
  experiment m2 --archive <disc path> --entry <i> --offset <n> --type <t> --value <v> --predict "<text>" [--repeat 2]
  experiment m3 --archive <disc path> --entry <i> --plan <json> --predict "<text>" [--file <igz>] [--repeat 2]
  experiment m2-judge --id <experiment id> --run <n> --observed "<text>" --match yes|no
  experiment explore [--game <wbfs|descriptor>] [--script <json>] [--label <name>]
  experiment play [--game <wbfs|descriptor>]
  experiment live-probe|ptr-scan|ram-diff [--save-slot <n>] [--pattern <hex>]... [--address <a,b>] [--label <name>]

Research ledger and evidence
  findings list [--category <name>] | show <id> | validate | render | editable | promote <id> --to <level> --summary "<text>"
  gates
  corpus <igz file>... [--fixups <igz file>=<map>]... [--out <report.json>]
  shot diff <baseline.png> <new.png> [--out <png>] [--box <n>] [--zoom 3]
  shot crop <png> --region x,y,w,h --out <png> [--zoom 3]

All commands accept --json. Exit codes: 0 success, 1 validation or experiment failure, 2 unsupported input,
3 usage or I/O error.`;
