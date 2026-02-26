(function(){const d=document.createElement("link").relList;if(d&&d.supports&&d.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))c(e);new MutationObserver(e=>{for(const i of e)if(i.type==="childList")for(const t of i.addedNodes)t.tagName==="LINK"&&t.rel==="modulepreload"&&c(t)}).observe(document,{childList:!0,subtree:!0});function l(e){const i={};return e.integrity&&(i.integrity=e.integrity),e.referrerPolicy&&(i.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?i.credentials="include":e.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function c(e){if(e.ep)return;e.ep=!0;const i=l(e);fetch(e.href,i)}})();const b="modulepreload",h=function(n){return"/"+n},u={},y=function(d,l,c){let e=Promise.resolve();if(l&&l.length>0){document.getElementsByTagName("link");const t=document.querySelector("meta[property=csp-nonce]"),r=(t==null?void 0:t.nonce)||(t==null?void 0:t.getAttribute("nonce"));e=Promise.allSettled(l.map(a=>{if(a=h(a),a in u)return;u[a]=!0;const s=a.endsWith(".css"),m=s?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${a}"]${m}`))return;const o=document.createElement("link");if(o.rel=s?"stylesheet":b,s||(o.as="script"),o.crossOrigin="",o.href=a,r&&o.setAttribute("nonce",r),document.head.appendChild(o),s)return new Promise((p,f)=>{o.addEventListener("load",p),o.addEventListener("error",()=>f(new Error(`Unable to preload CSS for ${a}`)))})}))}function i(t){const r=new Event("vite:preloadError",{cancelable:!0});if(r.payload=t,window.dispatchEvent(r),!r.defaultPrevented)throw t}return e.then(t=>{for(const r of t||[])r.status==="rejected"&&i(r.reason);return d().catch(i)})};function v(){return`
    <div id="panel">
      <button id="save-show-json" type="button">Salva mostra.json</button>
      <button id="edit-mode-toggle" type="button" aria-pressed="false">Edit: OFF</button>

    </div>
  `}function g(){return`
    <canvas
      id="minimap"
      width="700"
      height="120"
      aria-label="Minimappa dall'alto"
    ></canvas>
    <div id="map-tools">
    </div>
  `}function w(){return`${v()}${g()}`}function P(){return`
    <aside id="art-card" aria-live="polite" hidden>
      <button id="art-card-close" type="button" aria-label="Chiudi scheda">×</button>
      <img id="art-card-image" alt="Anteprima opera" />
      <h2 id="art-card-title"></h2>
      <p id="art-card-description"></p>
      <div id="art-card-synoptic"></div>
      <hr/>
      <div id="art-edit-panel" hidden>
        <h2 id="art-card-title">Editor</h2>
        <label class="edit-field" for="art-edit-id">ID opera</label>
        <input id="art-edit-id" type="text" />
        <label class="edit-field" for="art-edit-title">Titolo</label>
        <input id="art-edit-title" type="text" />
        <label class="edit-field" for="art-edit-description">Descrizione</label>
        <textarea id="art-edit-description" rows="3"></textarea>
        <label class="edit-field" for="art-edit-offset-cm">Offset parete (cm)</label>
        <input id="art-edit-offset-cm" type="number" min="0" max="100000" step="1" />
        <label class="edit-field" for="art-edit-width-cm">Larghezza opera (cm)</label>
        <input id="art-edit-width-cm" type="number" min="1" max="10000" step="1" />
        <label class="edit-field" for="art-edit-height-cm">Altezza opera (cm)</label>
        <input id="art-edit-height-cm" type="number" min="1" max="10000" step="1" readonly title="Calcolata automaticamente dal ratio immagine" />
        <label class="edit-field" for="art-edit-frame-border-cm">Spessore bordo (cm)</label>
        <input id="art-edit-frame-border-cm" type="number" min="0" max="1000" step="1" />
        <label class="edit-field" for="art-edit-frame-color">Colore bordo</label>
        <input id="art-edit-frame-color" type="color" value="#423934" />
        <label class="edit-field" for="art-edit-center-y-cm">Centro opera da pavimento (cm)</label>
        <input id="art-edit-center-y-cm" type="number" min="1" max="10000" step="1" />
        <label class="edit-field" for="art-edit-image-url">URL immagine</label>
        <input id="art-edit-image-url" type="text" />
        <label class="edit-field">Synopsis</label>
        <div id="art-edit-synopsis-list"></div>
        <button id="art-edit-synopsis-add" type="button">+ Aggiungi campo</button>
        <div id="art-edit-actions">
          <button id="art-edit-move-left" type="button">← Sinistra</button>
          <button id="art-edit-move-right" type="button">Destra →</button>
          <button id="art-edit-move-up" type="button">↑ Alto</button>
          <button id="art-edit-move-down" type="button">Basso ↓</button>
          <button id="art-edit-delete" type="button">Elimina quadro</button>
        </div>
        <hr/>
        <label class="edit-field" for="art-edit-room">Stanza</label>
        <select id="art-edit-room"></select>
        <label class="edit-field" for="art-edit-room-width-cm">Stanza larghezza (cm)</label>
        <input id="art-edit-room-width-cm" type="number" min="100" max="50000" step="1" />
        <label class="edit-field" for="art-edit-room-depth-cm">Stanza profondita (cm)</label>
        <input id="art-edit-room-depth-cm" type="number" min="100" max="50000" step="1" />
        <label class="edit-field" for="art-edit-room-height-cm">Stanza altezza (cm)</label>
        <input id="art-edit-room-height-cm" type="number" min="180" max="2000" step="1" />
        <label class="edit-field" for="art-edit-wall">Parete</label>
        <select id="art-edit-wall">
          <option value="north">north</option>
          <option value="south">south</option>
          <option value="west">west</option>
          <option value="east">east</option>
        </select>
        <hr/>
        <hr/>
        <hr/>
        <hr/>
        <hr/>
      </div>
    </aside>
  `}function x(){return`
    <section id="filmstrip" hidden aria-label="Galleria opere">
      <div id="filmstrip-items"></div>
      <button id="filmstrip-add" type="button" aria-label="Aggiungi opera">+ Nuova opera</button>
    </section>
  `}function E(){return`${P()}${x()}`}function S(){return`
    <div id="hud">
      <svg id="drag-measure-overlay" aria-hidden="true"></svg>
      ${w()}
      ${E()}
    </div>
  `}function z(){return`
    <canvas id="scene"></canvas>
    ${S()}
  `}const L=document.getElementById("app");L.innerHTML=z();y(()=>import("./galleryApp-r_uilurB.js"),[]).catch(n=>{console.error("Errore caricamento galleria:",n)});
