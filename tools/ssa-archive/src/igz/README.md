# src/igz — IGZ v5 object model (feature 002)

Big-endian IGZ version 5 files are what the LZMA-chunked entries of the level `.bld` archives decode to (`docs/findings/igz-objects.md`). This module reads the header and section table, the type-name and size tables, enumerates objects by their `{type, 1, 0x01xxxxxx}` header, resolves string and object references, and accounts for 100 % of the object section as objects, explicit unparsed regions or padding. Interpretations carry confidence labels; nothing here edits the game.

Non-commercial fan research and preservation tooling: it reads decoded copies of the researcher's own game files and this repository never carries game data (root `README.md`).
