// An isolated file-replacement probe, not an SSA archive mutation or M1 test.
// The replacement keeps the original text and pads it with newlines to a distinctive size.
// Dolphin's file monitor logs the size served from the (patched) disc file system, so a
// different "kB" value than the unpatched run is engine-level proof the external file was used.
// A trailing marker was tried first: the game only keeps the parsed first line in RAM, so an
// appended marker cannot be found and is not a valid proof.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {local,buildDescriptor} from './runtime.mjs';
const source=path.join(local,'riivolution-smoke/files/DATA/files/hbm/config.txt');
const bytes=fs.readFileSync(source);
const targetSize=61447; // logs as "61 kB"; the original 35 bytes log as "0 kB"
const replacement=Buffer.concat([bytes,Buffer.alloc(targetSize-bytes.length,0x0a)]);
const directory=path.join(local,'riivolution-proof');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'config.txt'),replacement);
const xml=path.join(directory,'proof.xml');
fs.writeFileSync(xml,`<?xml version="1.0" encoding="utf-8"?>
<wiidisc version="1">
  <id game="SSP" developer="52"><region type="P" /></id>
  <options><section name="PortalForge"><option id="m0-proof" name="M0 file probe" default="1"><choice name="Enabled"><patch id="m0-proof" /></choice></option></section></options>
  <patch id="m0-proof"><file disc="/hbm/config.txt" external="config.txt" resize="true" create="false" /></patch>
</wiidisc>
`);
const {game}=JSON.parse(fs.readFileSync(path.join(local,'dolphin-config.json'),'utf8'));
const descriptor=buildDescriptor(game,xml,directory,[{'option-id':'m0-proof',choice:1}]);
fs.writeFileSync(path.join(directory,'launch.json'),JSON.stringify(descriptor,null,2));
const manifest={source,source_sha256:createHash('sha256').update(bytes).digest('hex'),original_size:bytes.length,
  replacement_size:replacement.length,replacement_sha256:createHash('sha256').update(replacement).digest('hex'),
  expected_original_log:'0 kB hbm/config.txt',expected_patched_log:Math.floor(replacement.length/1000)+' kB hbm/config.txt',
  disc_path:'/hbm/config.txt',mutation:'append newline padding; resize=true',descriptor:path.join(directory,'launch.json'),validation:'PENDING'};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
