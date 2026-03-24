import{c,j as o}from"./index-Dfxo9S1r.js";/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["line",{x1:"19",x2:"19",y1:"8",y2:"14",key:"1bvyxn"}],["line",{x1:"22",x2:"16",y1:"11",y2:"11",key:"1shjgl"}]],p=c("user-plus",x);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]],m=c("user",d),b={sm:{container:"w-6 h-6",text:"text-[10px]",dot:"w-2 h-2 -bottom-0.5 -right-0.5"},md:{container:"w-8 h-8",text:"text-xs",dot:"w-2.5 h-2.5 -bottom-0.5 -right-0.5"},lg:{container:"w-11 h-11",text:"text-sm",dot:"w-3 h-3 -bottom-0.5 -right-0.5"}},g={online:"bg-[#1FC5A8]",offline:"bg-[#939084]",away:"bg-[#E5A940]"};function u(e){let t=0;for(let n=0;n<e.length;n++)t=e.charCodeAt(n)+((t<<5)-t);return Math.abs(t)}const i=["bg-[#553DE9]","bg-[#D63384]","bg-[#1FC5A8]","bg-[#E5A940]","bg-[#3B82F6]","bg-[#8B5CF6]","bg-[#EC4899]","bg-[#06B6D4]"];function y(e){var n;const t=e.trim().split(/\s+/);return t.length>=2?(t[0][0]+t[t.length-1][0]).toUpperCase():(((n=t[0])==null?void 0:n[0])||"?").toUpperCase()}function A({name:e,image:t,size:n="md",status:r,className:l=""}){const s=b[n],a=i[u(e)%i.length],h=y(e);return o.jsxs("span",{className:`relative inline-flex flex-shrink-0 ${l}`,children:[t?o.jsx("img",{src:t,alt:e,className:`${s.container} rounded-full object-cover`}):o.jsx("span",{className:`${s.container} ${a} rounded-full inline-flex items-center justify-center text-white font-semibold ${s.text}`,title:e,children:h}),r&&o.jsx("span",{className:`absolute ${s.dot} ${g[r]} rounded-full border-2 border-white dark:border-[#1A1A1E]`,title:r})]})}export{A,p as U,m as a};
