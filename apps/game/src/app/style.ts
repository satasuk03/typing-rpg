/** Layout and component CSS for the app screens (the shared look is in hud/uiTheme.ts). */
export const APP_CSS = `
#app-ui{position:fixed;inset:0;z-index:20;pointer-events:none}
#app-ui .app-screen{position:absolute;inset:0;display:flex;flex-direction:column;padding:20px 40px 24px;pointer-events:auto;overflow:hidden}
#app-ui .app-screen::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%,rgba(5,6,10,.35) 0%,rgba(5,6,10,.72) 70%,rgba(5,6,10,.9) 100%)}
#app-ui .app-screen.title::before{background:linear-gradient(180deg,rgba(5,6,10,.55) 0%,rgba(5,6,10,0) 35%,rgba(5,6,10,0) 55%,rgba(5,6,10,.85) 100%)}
#app-ui .app-screen.map::before{background:linear-gradient(180deg,rgba(5,6,10,.7) 0%,rgba(5,6,10,.15) 40%,rgba(5,6,10,.55) 100%)}
.app-head{display:flex;align-items:flex-end;gap:24px;padding-bottom:10px;margin-bottom:14px;border-bottom:2px solid transparent;
  border-image:linear-gradient(90deg,var(--edge),rgba(184,149,90,0)) 1}
.app-head>div:first-child{flex:1}
.app-head .hd-title{margin-top:2px}
.app-hint{color:var(--dim);font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding-bottom:4px}
.app-res{display:flex;gap:22px;align-items:center}
.app-res-i{color:var(--muted);font-size:13px;letter-spacing:.06em;display:inline-flex;align-items:center;gap:6px}
.app-res-i b{color:var(--gold-hi)}
.hd-input{font:14px var(--f-ui);color:var(--ink);background:#0a0710;border:2px solid #6e5a38;padding:8px 10px;width:100%;outline:none;letter-spacing:.04em;margin-top:6px;user-select:text}
.hd-input:focus{border-color:var(--gold-hi);box-shadow:0 0 0 2px #05060a,0 0 0 4px #ffcf4a,0 0 18px rgba(255,200,90,.4)}
.hd-input.sm{width:120px;margin:0}
.hd-star{display:inline-block;width:18px;height:18px;background:currentColor;
  clip-path:polygon(50% 0,62% 36%,100% 38%,70% 60%,81% 96%,50% 74%,19% 96%,30% 60%,0 38%,38% 36%);text-shadow:none}
.hd-star.on{filter:drop-shadow(0 0 4px rgba(255,200,60,.8))}
.btns{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;padding-left:16px}

/* ---------------------------------------------------------------- title */
.title .title-logo{position:absolute;left:0;right:0;top:11%;text-align:center}
.title-logo .hd-sub{display:inline-block;color:#fff6d8;font-size:15px;letter-spacing:.14em;padding:7px 22px;
  background:rgba(8,6,11,.82);border:1px solid #8a6f3e;box-shadow:0 0 0 2px rgba(0,0,0,.6),0 4px 18px rgba(0,0,0,.6);text-shadow:0 1px 0 #000}
.title-logo .hd-eyebrow{text-shadow:0 2px 0 #000,0 0 8px #000}
.logo-pix{margin:0;display:flex;justify-content:center;animation:logobob 2.4s steps(1,end) infinite}
.logo-art{position:relative;display:block}
.logo-art canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:-webkit-optimize-contrast;image-rendering:pixelated}
.logo-art .logo-glint{position:absolute;left:0;top:0;mix-blend-mode:plus-lighter;
  -webkit-mask-image:linear-gradient(105deg,transparent 42%,#000 42%,#000 50%,transparent 50%,transparent 54%,#000 54%,#000 57%,transparent 57%);
  mask-image:linear-gradient(105deg,transparent 42%,#000 42%,#000 50%,transparent 50%,transparent 54%,#000 54%,#000 57%,transparent 57%);
  -webkit-mask-size:400% 100%;mask-size:400% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  animation:logoglint 3.6s steps(18,end) infinite}
.logo-spark{position:absolute;width:var(--px);height:var(--px);margin:calc(var(--px) * -.5);background:#fffbe0;opacity:0;
  box-shadow:var(--px) 0 #ffe070,calc(var(--px) * -1) 0 #ffe070,0 var(--px) #ffe070,0 calc(var(--px) * -1) #ffe070;animation:logospark 2.8s steps(1,end) infinite}
.logo-tag{margin:10px 0 0;font:16px var(--f-pix);letter-spacing:.35em;padding-left:.35em;color:#ffd9b0;-webkit-text-stroke:4px #1a0b10;paint-order:stroke fill;text-shadow:3px 3px 0 #0a0408}
.logo-crest{display:flex;justify-content:center;margin:14px 0 12px;animation:logobob 2.4s steps(1,end) infinite;animation-delay:-.6s}
.logo-crest canvas{image-rendering:pixelated;display:block}
.title-press{position:absolute;left:0;right:0;bottom:21%;text-align:center;font:15px var(--f-pix);letter-spacing:.3em;color:var(--gold-hi);-webkit-text-stroke:4px #000;paint-order:stroke fill;text-shadow:0 2px 0 #000}
.title-press span{display:inline-block;animation:pressblink 1.3s steps(2,jump-none) infinite}
@keyframes pressblink{0%{opacity:1}50%{opacity:.55}100%{opacity:1}}
@keyframes logobob{0%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes logoglint{0%{-webkit-mask-position:-30% 0;mask-position:-30% 0}45%,100%{-webkit-mask-position:130% 0;mask-position:130% 0}}
@keyframes logospark{0%,60%{opacity:0}65%{opacity:1}80%{opacity:.7}90%,100%{opacity:0}}
.title-menu{position:absolute;left:50%;bottom:13%;transform:translateX(-50%);width:300px;display:flex;flex-direction:column;gap:14px;padding-left:14px}
.title-menu[hidden],.title-press[hidden]{display:none}
.title-foot{position:absolute;left:40px;right:40px;bottom:16px;display:flex;justify-content:space-between;color:var(--dim);font-size:12px;letter-spacing:.1em}
@keyframes blink{50%{opacity:.15}}
.app-confirm{width:480px}
.story,.calibrate{align-items:center;justify-content:center}
.story-card{width:760px;text-align:center;padding:34px 44px 22px}
.story-card .story-t{font-size:38px;margin:8px 0 6px}
.story-card .story-p{font:18px/1.6 var(--f-ui);color:#efe6cf;margin:16px auto 22px;max-width:620px}
.story-dots{display:flex;gap:10px;justify-content:center;margin-bottom:14px}
.story-dots i{width:10px;height:10px;background:#3a3550;transform:rotate(45deg)}
.story-dots i.on{background:var(--gold);box-shadow:0 0 8px rgba(255,200,90,.7)}
.story-keys{display:flex;justify-content:center;gap:28px;font:11px var(--f-pix);letter-spacing:.1em;color:var(--muted)}
.cal-card{width:820px;text-align:center;padding:26px 40px 20px}
.cal-card .cal-why{font:14px/1.5 var(--f-ui);color:#efe6cf;margin:12px auto 16px;max-width:640px}
.cal-card .hd-title{margin-top:6px}
.cal-word{font:900 54px/1.1 var(--f-disp);letter-spacing:.14em;color:#8e8470;margin:6px 0 10px;min-height:64px}
.cal-word .ok{color:var(--good)}
.cal-word .cur{color:var(--gold-hi);border-bottom:4px solid var(--gold-hi)}
.cal-word.bad{animation:calBad .25s}
@keyframes calBad{0%,100%{transform:none}25%{transform:translateX(-6px);color:#ff8a7a}75%{transform:translateX(6px)}}
.cal-next{font:18px/1.5 var(--f-pix);letter-spacing:.12em;color:#a99f88;min-height:56px}
.cal-bar{height:10px;background:#0a0710;border:1px solid #3a3550;margin:12px 0 8px}
.cal-bar i{display:block;height:100%;background:linear-gradient(90deg,#c99a3c,#ffe08a);transition:width .1s linear}
.cal-foot{display:flex;justify-content:space-between;font:12px var(--f-pix);letter-spacing:.1em;color:var(--muted)}
.cal-res{display:flex;justify-content:center;gap:46px;margin:14px 0 10px}
.cal-res div{display:flex;flex-direction:column;align-items:center}
.cal-res b{font:900 52px var(--f-disp);color:var(--gold-hi);text-shadow:0 2px 0 #5b3d12}
.cal-res span{font:11px var(--f-pix);letter-spacing:.2em;color:var(--muted);text-transform:uppercase}

/* ---------------------------------------------------------------- map */
.map-body{position:relative;flex:1}
.road-wrap{position:absolute;left:2%;right:2%;top:0;height:270px}
.road-wrap::before{content:"";position:absolute;left:-2.1%;right:-2.1%;top:6px;height:244px;background:linear-gradient(180deg,rgba(5,6,10,0) 0,rgba(5,6,10,.35) 14%,rgba(5,6,10,.35) 86%,rgba(5,6,10,0) 100%);pointer-events:none;-webkit-mask:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.road-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.road{stroke:rgba(233,196,106,.35);stroke-width:3;stroke-dasharray:3 6;vector-effect:non-scaling-stroke;fill:none}
.road.done{stroke:#ffd25a;stroke-dasharray:none;stroke-width:4;filter:drop-shadow(0 0 5px rgba(255,200,80,.7))}
.node{position:absolute;transform:translate(-50%,-34px);display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:0;padding:6px 4px;cursor:pointer;outline:none;font:inherit;color:var(--ink)}
.node .gem{display:block;width:50px;height:50px;transform:rotate(45deg);border:3px solid var(--edge);background:linear-gradient(135deg,#2c2238,#0b0810);
  box-shadow:0 0 0 3px #000,inset 0 0 10px rgba(255,220,140,.12);transition:transform .12s,box-shadow .12s}
.node .gem b{display:block;transform:rotate(-45deg);text-align:center;line-height:44px;font:15px var(--f-pix);color:var(--gold-hi)}
.node.new .gem{border-color:#ffd25a;box-shadow:0 0 0 3px #000,0 0 18px rgba(255,200,80,.6);animation:nodepulse 1.8s ease-in-out infinite}
.node.cleared .gem{border-color:#9be59b;background:linear-gradient(135deg,#1f3a2a,#0b1410)}
.node.cleared .gem b{color:#d8ffd8}
.node.locked .gem{border-color:#4a4358;background:linear-gradient(135deg,#1a1620,#0a080d);box-shadow:0 0 0 3px #000}
.node.locked .gem b{color:#6a6278}
.node.boss .gem{width:64px;height:64px;border-color:#ff7a64;background:linear-gradient(135deg,#4a1220,#14060b);box-shadow:0 0 0 3px #000,0 0 22px rgba(255,90,70,.55)}
.node.boss .gem b{line-height:58px;font-size:18px;color:#ffd0c0}
.node.boss.locked .gem{border-color:#5a3a40;box-shadow:0 0 0 3px #000;background:linear-gradient(135deg,#241418,#0a0709)}
.node.boss::before{content:"";width:30px;height:15px;margin-bottom:-2px;background:#ffd25a;filter:drop-shadow(0 0 4px rgba(255,200,80,.7));
  clip-path:polygon(0 100%,0 20%,25% 55%,50% 0,75% 55%,100% 20%,100% 100%)}
.node.boss.locked::before{background:#5a4a40;filter:none}
.node:hover .gem{transform:rotate(45deg) scale(1.08)}
.node:focus .gem{transform:rotate(45deg) scale(1.2);border-color:var(--gold-hi);box-shadow:0 0 0 3px #000,0 0 0 6px #ffcf4a,0 0 26px rgba(255,200,90,.8)}
.node:focus::after{content:"";position:absolute;top:-20px;left:50%;margin-left:-7px;border:7px solid transparent;border-top-color:#ffcf4a;filter:drop-shadow(0 0 4px rgba(255,200,90,.9))}
.nstars{display:flex;gap:2px;margin-top:8px;filter:drop-shadow(0 1px 0 #000)}
.nstars .hd-star{width:14px;height:14px;color:#3a3550}
.nstars .hd-star.on{color:#ffd24a}
.ntag{background:rgba(8,6,12,.88);font:10px var(--f-pix);letter-spacing:.14em;padding:2px 6px;border:1px solid currentColor}
.ntag.t-new{color:#ffd25a}.ntag.t-cleared{color:#9be59b}.ntag.t-locked{color:#6a6278}
@keyframes nodepulse{50%{box-shadow:0 0 0 3px #000,0 0 30px rgba(255,200,80,.9)}}
.map-detail{position:absolute;left:0;right:0;bottom:84px;height:172px;display:grid;grid-template-columns:1.1fr 1fr;gap:30px;align-items:center}
.map-detail table{border-collapse:collapse;font-size:13px}
.map-detail td{padding:2px 14px 2px 0;color:var(--ink)}
.map-detail td:first-child{color:var(--muted)}
.map-menu{position:absolute;left:0;right:0;bottom:6px;display:flex;gap:12px;justify-content:center;padding-left:14px;flex-wrap:wrap}

/* ---------------------------------------------------------------- loadout / inventory / journal / shop */
.lo-body{flex:1;display:grid;grid-template-columns:1fr 1.25fr;gap:26px;min-height:0}
.lo-body>.hd-panel{overflow:auto}
.lo-stats{display:flex;gap:44px;margin-bottom:6px}
.lo-stats div{display:flex;flex-direction:column;gap:2px}
.lo-stats b{font:26px var(--f-pix);color:var(--gold-hi);text-shadow:0 2px 0 #2a1406}
.slotrow{display:flex;gap:10px;align-items:stretch}
.slotrow .hd-item{flex:1}
.slotrow .hd-btn{align-self:center;width:78px}
.hd-ico.empty{border-style:dashed;background:#0a0710}
.hd-item.locked{opacity:.5}
.app-pick{width:560px}
.app-pick .hd-list{max-height:52vh;overflow:auto;padding:4px}

.inv-body,.jr-body{flex:1;display:grid;grid-template-columns:400px 1fr;gap:26px;min-height:0}
.inv-body>.hd-panel,.jr-body>.hd-panel{overflow:auto;min-height:0}
.inv-tabs{margin-bottom:10px;display:flex;flex-wrap:wrap}
.inv-tabs .hd-btn{text-transform:capitalize}
.inv-items,.jr-items{padding:4px}
.inv-top{display:flex;gap:16px;align-items:center;margin-bottom:12px}
.inv-stats{border-collapse:collapse;margin-bottom:10px}
.inv-stats td{padding:3px 22px 3px 0}.inv-stats td:first-child{color:var(--muted)}
.inv-transfer{margin:10px 0;padding:10px 14px;font-size:13px;line-height:1.6;border-color:#4a5f3a}
.inv-acts{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;padding-left:14px}
.jr-word{font:900 34px var(--f-disp);color:var(--gold-hi);letter-spacing:.08em;text-shadow:0 2px 0 #5b3d12}
.jr-detail .hd-eyebrow{display:block;margin-top:10px}
.jr-def,.jr-ex{margin:2px 0 10px;font-size:14px;line-height:1.5}
.jr-ex{color:#cfe8d0;font-style:italic}
.jr-meta{border-collapse:collapse;margin-bottom:10px;font-size:13px}
.jr-meta td{padding:2px 20px 2px 0}.jr-meta td:first-child{color:var(--muted)}
.pips{display:inline-flex;gap:3px;vertical-align:middle}
.pips i{width:9px;height:9px;background:#2a2338;border:1px solid #4a4358}
.pips i.on{background:#ffd25a;border-color:#5b3d12}.pips i.m{background:#9be59b}

.shop-body{flex:1;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:auto;padding:6px 6px 0 14px}
.shop-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.shop-col .hd-h{text-transform:capitalize;margin-bottom:6px}
.shop-col.hd-panel{padding:12px 16px}
.shop-arch{margin-bottom:8px;display:flex;flex-wrap:wrap}
.shop-arch .hd-btn{text-transform:capitalize;font-size:11px;padding:4px 8px}
.shop-card{display:grid;grid-template-columns:56px 1fr;gap:6px 12px;align-items:center;padding:8px;margin-bottom:8px;background:rgba(255,255,255,.03);border:1px solid #2a2338;font-size:12px}
.shop-card .grow{min-width:0}
.shop-card .nm{color:var(--gold-hi);font-size:13px}
.shop-card .hd-btn{grid-column:1/-1;justify-self:stretch;text-align:center}
.shop-card .hd-coin{font-size:13px}
.shop-cache{display:flex;align-items:center;gap:18px;padding:12px 20px}
.shop-cache .grow{flex:1;font-size:13px}
.shop-note{font-size:12px;padding-left:2px}

/* ---------------------------------------------------------------- cache */
.cache-body{flex:1;display:grid;grid-template-columns:1fr 360px;gap:26px;min-height:0}
.cache-stage{position:relative;overflow:hidden;border:2px solid var(--edge);box-shadow:0 0 0 3px #000,inset 0 0 60px rgba(0,0,0,.7);
  background:radial-gradient(ellipse at 50% 70%,#2a2038 0%,#0c0914 70%);--rar:#b9b4a6}
.cache-stage .rays{position:absolute;left:50%;top:36%;width:900px;height:900px;margin:-450px 0 0 -450px;opacity:0;pointer-events:none;
  background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--rar) 55%,transparent) 0 6deg,transparent 6deg 24deg);
  -webkit-mask:radial-gradient(circle,#000 0,transparent 60%);mask:radial-gradient(circle,#000 0,transparent 60%)}
.cache-stage .beam{position:absolute;left:50%;bottom:62%;width:120px;height:0;margin-left:-60px;opacity:0;pointer-events:none;
  background:linear-gradient(90deg,transparent 0,var(--rar) 22%,#fff 50%,var(--rar) 78%,transparent 100%);-webkit-mask:linear-gradient(0deg,#000 0,#000 40%,transparent 100%);mask:linear-gradient(0deg,#000 0,#000 40%,transparent 100%);mix-blend-mode:screen;filter:blur(2px)}
.cache-stage .chest-glow{position:absolute;left:50%;top:36%;width:260px;height:120px;margin:-30px 0 0 -130px;pointer-events:none;opacity:.35;background:radial-gradient(ellipse,color-mix(in srgb,var(--rar) 70%,transparent) 0,transparent 70%)}
.cache-stage[data-phase=burst] .chest-glow,.cache-stage[data-phase=revealed] .chest-glow{opacity:.95}
.chest .chest-img{display:block;width:54px;height:auto;image-rendering:pixelated;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--rar) 60%,transparent)) drop-shadow(0 2px 0 #000)}
.cache-stage .burst{position:absolute;left:50%;top:0;transform:translateX(-50%);pointer-events:none}
.cache-stage .chest{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(2.2);transform-origin:center;text-align:center;image-rendering:pixelated}
.cache-stage .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;mix-blend-mode:screen}
.cache-stage .cache-msg{position:absolute;left:0;right:0;bottom:14px;text-align:center;padding:0 20px}
.cache-stage .reveal{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:26px}
.cache-stage .reveal[hidden]{display:none}
.rv-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 30px;text-align:center;background:rgba(10,8,16,.9);
  border:2px solid var(--rar);box-shadow:0 0 0 3px #000,0 0 40px color-mix(in srgb,var(--rar) 55%,transparent);animation:cardpop .38s cubic-bezier(.2,1.4,.4,1) both}
.rv-name{font:900 24px var(--f-disp);letter-spacing:.08em;color:#fff0b8;text-shadow:0 2px 0 #2a1406}
.rv-cmp{font-size:12px;color:var(--muted)}
.rv-acts{display:flex;gap:12px;margin-top:6px;padding-left:14px}
.cache-stage[data-phase=opening] .chest{animation:chestshake .76s linear both}
.cache-stage[data-phase=opening] .rays{opacity:.15;transition:opacity .7s}
.cache-stage[data-phase=burst] .rays,.cache-stage[data-phase=revealed] .rays{opacity:.5;animation:spin 14s linear infinite}
.cache-stage[data-phase=burst] .beam,.cache-stage[data-phase=revealed] .beam{animation:beamup .9s ease-out both}
.cache-stage[data-phase=burst] .flash{animation:flashy .3s ease-out}
.cache-stage[data-phase=burst] .chest{animation:chestpop .35s ease-out both}
.cache-stage[data-phase=revealed] .chest{opacity:1}
.cache-stage.noflash .flash{display:none}
.cache-stage.reduced .chest,.cache-stage.reduced .rays,.cache-stage.reduced .beam{animation:none!important}
.cache-stage.reduced[data-phase=burst] .beam,.cache-stage.reduced[data-phase=revealed] .beam{height:60%;opacity:.7}
.cache-stage.reduced .rv-card{animation:none}
.cache-side{display:flex;flex-direction:column;gap:16px}
.cache-btns{display:flex;flex-direction:column;gap:12px;padding-left:14px}
.pity-row{margin-bottom:12px}
.pity-l{display:flex;flex-direction:column;gap:2px;font-size:12px;margin-bottom:5px;color:var(--muted)}
.pity-l b{color:var(--gold-hi);font-weight:400}
.pity-row .hd-bar{height:10px}
@keyframes chestshake{0%{transform:translate(-50%,-50%) scale(2.2)}10%{transform:translate(-52%,-50%) scale(2.2) rotate(-3deg)}20%{transform:translate(-48%,-50%) scale(2.25) rotate(3deg)}
  30%{transform:translate(-53%,-51%) scale(2.3) rotate(-4deg)}40%{transform:translate(-47%,-50%) scale(2.3) rotate(4deg)}55%{transform:translate(-54%,-52%) scale(2.4) rotate(-5deg)}
  70%{transform:translate(-46%,-51%) scale(2.45) rotate(5deg)}85%{transform:translate(-52%,-53%) scale(2.55) rotate(-4deg)}100%{transform:translate(-50%,-50%) scale(2.6)}}
@keyframes chestpop{from{transform:translate(-50%,-50%) scale(2.6)}to{transform:translate(-50%,-50%) scale(2.2)}}
@keyframes beamup{0%{height:0;opacity:0}30%{opacity:1}100%{height:60%;opacity:.85}}
@keyframes flashy{0%{opacity:.85}100%{opacity:0}}
@keyframes cardpop{from{transform:translateY(24px) scale(.8);opacity:0}to{transform:none;opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}

/* odds */
.app-odds{width:640px}
.odds-t{width:100%;border-collapse:collapse;margin-bottom:12px}
.odds-t th{font:11px var(--f-pix);letter-spacing:.12em;color:var(--cool);text-align:left;padding:4px 8px;border-bottom:1px solid #3a3550;font-weight:400}
.odds-t td{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.05)}
.odds-t td.eff{color:var(--gold-hi)}
.odds-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px}
.odds-pity{margin:6px 0 10px;padding-left:20px;line-height:1.7;font-size:13px}
.odds-pity b{color:var(--gold-hi)}

/* ---------------------------------------------------------------- settings */
.set-body{flex:1;display:grid;grid-template-columns:1fr 1fr 1.15fr;grid-template-rows:minmax(0,1fr) auto;gap:22px;min-height:0}
.set-body>.set-help{grid-column:1/-1;display:flex;gap:48px;align-items:center;padding-top:12px;padding-bottom:12px}
.set-body>.set-help .hd-h{margin:0}
.set-body>.set-help .set-row{border:0;padding:0;gap:18px}
.set-body>.hd-panel{overflow:auto}
.set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.set-row:last-child{border-bottom:0}
.set-l{display:flex;flex-direction:column;gap:1px;font-size:13px}
.set-l b{font-weight:400;color:var(--gold-hi)}
.set-l .hd-dim{font-size:11px}
.set-val{width:44px;text-align:right;font:12px var(--f-pix);color:var(--gold-hi)}
.set-row.seg-row{flex-direction:column;align-items:flex-start}
.set-row .hd-seg{flex-wrap:wrap}
input[type=range]{-webkit-appearance:none;appearance:none;height:10px;background:#0a0710;border:2px solid #4a3c24;outline:none;min-width:130px}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:22px;background:linear-gradient(180deg,#f4d690,#c99a3c);border:2px solid #2a1406;cursor:pointer}
input[type=range]:focus{box-shadow:0 0 0 2px #05060a,0 0 0 4px #ffcf4a,0 0 16px rgba(255,200,90,.45)}
input[type=checkbox]{-webkit-appearance:none;appearance:none;width:18px;height:18px;margin:0;background:#0a0710;border:2px solid #6e5a38;cursor:pointer;outline:none}
input[type=checkbox]:checked{background:linear-gradient(180deg,#f4d690,#c99a3c);border-color:#fff0b8}
input[type=checkbox]:focus{box-shadow:0 0 0 2px #05060a,0 0 0 4px #ffcf4a}
.audio-themed{background:transparent!important;border:0!important;color:var(--ink)!important;font:13px var(--f-ui)!important;padding:0!important;min-width:0!important;border-radius:0!important}
.audio-themed h2{display:none}
.audio-themed div{grid-template-columns:84px 1fr auto!important}
.audio-themed label{color:var(--gold-hi);font-size:13px}
.audio-themed button{font:12px var(--f-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--gold);cursor:pointer;background:linear-gradient(180deg,#241b30,#0d0a13);
  border:2px solid #6e5a38;padding:5px 11px;outline:none;box-shadow:0 3px 0 #000}
.audio-themed button:focus{border-color:var(--gold-hi);color:var(--gold-hi);box-shadow:0 0 0 2px #05060a,0 0 0 4px #ffcf4a}
.audio-themed input[type=range]{width:100%}

/* ---------------------------------------------------------------- complete + touch block */
.complete{align-items:center;justify-content:center}
.complete .comp-card{width:720px;text-align:center}
.comp-stars{display:flex;justify-content:center;align-items:center;gap:10px;margin:8px 0}
.comp-stars b{font:30px var(--f-pix);color:var(--gold-hi)}
.comp-stars .hd-star{width:30px;height:30px}
.comp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 20px;margin:6px 0}
.comp-grid div{display:flex;flex-direction:column;gap:8px}
.comp-grid b{font:20px var(--f-pix);color:var(--gold-hi)}
.touch-block{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 30%,#1b2236,#05060a 70%)}
.tb-card{width:min(640px,88vw);text-align:center}
.tb-keys{display:flex;justify-content:center;gap:5px;margin-top:16px;flex-wrap:wrap}
.tb-keys i{display:block;width:34px;height:34px;line-height:32px;font:13px var(--f-pix);font-style:normal;color:var(--gold);background:linear-gradient(180deg,#2c2238,#0d0a13);
  border:2px solid #6e5a38;border-bottom-width:5px;border-radius:3px}
.tb-keys i.wide{width:230px;flex-basis:100%;margin:2px auto 0;max-width:260px}
@media (prefers-reduced-motion:reduce){.node.new .gem,.title-press span,.logo-pix,.logo-crest,.logo-glint,.logo-spark{animation:none}}
`;
