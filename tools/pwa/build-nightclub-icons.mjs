/** 沿用项目现有 Lucide 图标，导出为 PNG 遮罩图集。需已有 Python CairoSVG。 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { House, Mic, MessageCircle, UserRound, Gamepad2, ShieldCheck, Gem, KeyRound, Bot, Apple, CircleDot, Blocks, Fish, Layers, Rocket, Dices } from 'lucide-react';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const icons=[House,Mic,MessageCircle,UserRound,Gamepad2,ShieldCheck,Gem,KeyRound,Bot,Apple,CircleDot,Blocks,Fish,Layers,Rocket,Dices];
const cells=icons.map((Icon,i)=>{
 const svg=renderToStaticMarkup(React.createElement(Icon,{size:52,strokeWidth:1.6,color:'#ffffff'})).replace('<svg','<svg x="'+((i%4)*64+6)+'" y="'+(Math.floor(i/4)*64+6)+'"');
 return svg;
});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">'+cells.join('')+'</svg>';
mkdirSync('public/assets/nightclub',{recursive:true});
const result=spawnSync('python3',['-c',"import sys,cairosvg;cairosvg.svg2png(bytestring=sys.stdin.buffer.read(),write_to='public/assets/nightclub/icons-v1.png')"],{input:svg});
if(result.status!==0)throw Error(result.stderr.toString());
writeFileSync('design/nightclub-v1/icons-source.svg',svg);
console.log('16 existing Lucide icons exported as a 256px PNG mask atlas.');
