/**
 * Consentement — bandeau cookies conforme CNIL, sans dépendance.
 *
 * Principe : les scripts tiers sont neutralisés dans le HTML et ne sont
 * activés qu'après consentement explicite de leur catégorie.
 *
 *   <script type="text/plain" data-consentement="mesure"
 *           data-src="https://exemple.fr/tag.js"></script>
 *
 *   <iframe data-consentement="marketing" src="about:blank"
 *           data-src="https://www.youtube.com/embed/XXX"></iframe>
 *
 * Le retrait du consentement supprime les cookies déjà déposés et recharge
 * la page, pour que rien ne subsiste des scripts déjà exécutés.
 *
 * Usage : <script src="/consentement.js" defer></script>
 * Réouverture : <button onclick="Consentement.ouvrir()">Gérer mes cookies</button>
 */
(function () {
  'use strict'

  var CONFIG = {
    // Incrémenter à chaque changement de finalités ou de textes :
    // les consentements antérieurs sont alors redemandés.
    version: 1,
    nomCookie: 'consentement',
    dureeJours: 182, // ~6 mois, recommandation CNIL
    // Endpoint de journalisation de la preuve. null pour désactiver.
    urlJournal: '/api/consentement',
    // Préfixes de cookies à effacer quand une catégorie est refusée ou retirée.
    cookiesParCategorie: {
      mesure: ['_ga', '_gid', '_gat', '_hj', '_pk_', '__utm'],
      marketing: ['_fbp', '_fbc', 'fr', 'IDE', '_gcl_', 'test_cookie', 'VISITOR_INFO'],
    },
  }

  var CATEGORIES = [
    {
      cle: 'necessaire',
      titre: 'Strictement nécessaires',
      texte: 'Indispensables au fonctionnement du site : connexion, panier, sécurité, mémorisation de votre choix ci-contre. Ils ne peuvent pas être désactivés.',
      obligatoire: true,
    },
    {
      cle: 'mesure',
      titre: 'Mesure d’audience',
      texte: 'Nous aident à comprendre comment le site est utilisé, afin de l’améliorer. Les statistiques produites sont globales.',
      obligatoire: false,
    },
    {
      cle: 'marketing',
      titre: 'Contenus et publicité',
      texte: 'Permettent l’affichage de vidéos et de contenus externes, et la mesure de nos campagnes.',
      obligatoire: false,
    },
  ]

  /* ---------------------------------------------------------------- cookies */

  function lireCookie(nom) {
    var parts = document.cookie.split('; ')
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].split('=')
      if (decodeURIComponent(p[0]) === nom) return decodeURIComponent(p.slice(1).join('='))
    }
    return null
  }

  function ecrireCookie(nom, valeur, jours) {
    var d = new Date()
    d.setTime(d.getTime() + jours * 864e5)
    var securise = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie =
      encodeURIComponent(nom) + '=' + encodeURIComponent(valeur) +
      '; Expires=' + d.toUTCString() + '; Path=/; SameSite=Lax' + securise
  }

  /** Efface un cookie sur toutes les combinaisons domaine/chemin plausibles. */
  function effacerCookie(nom) {
    var hote = location.hostname
    var domaines = ['', hote, '.' + hote]
    var parties = hote.split('.')
    if (parties.length > 2) domaines.push('.' + parties.slice(-2).join('.'))
    var chemins = ['/', location.pathname]
    for (var i = 0; i < domaines.length; i++) {
      for (var j = 0; j < chemins.length; j++) {
        document.cookie =
          encodeURIComponent(nom) + '=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=' +
          chemins[j] + (domaines[i] ? '; Domain=' + domaines[i] : '')
      }
    }
  }

  function effacerCookiesDe(categorie) {
    var prefixes = CONFIG.cookiesParCategorie[categorie] || []
    var noms = document.cookie.split('; ').map(function (c) {
      return decodeURIComponent(c.split('=')[0])
    })
    noms.forEach(function (nom) {
      for (var i = 0; i < prefixes.length; i++) {
        if (nom.indexOf(prefixes[i]) === 0) { effacerCookie(nom); break }
      }
    })
  }

  /* ------------------------------------------------------------------ état */

  function etatParDefaut() {
    return { necessaire: true, mesure: false, marketing: false }
  }

  function lireChoix() {
    var brut = lireCookie(CONFIG.nomCookie)
    if (!brut) return null
    try {
      var d = JSON.parse(brut)
      if (d.version !== CONFIG.version) return null // finalités modifiées : on redemande
      return d
    } catch (e) {
      return null
    }
  }

  var choix = lireChoix()
  var etat = choix ? choix.categories : etatParDefaut()

  /* ------------------------------------------- activation des scripts tiers */

  /**
   * Retrouve le substitut (placeholder) associé à UN cadre précis.
   *
   * Une recherche globale par catégorie renvoie le même premier élément pour
   * tous les cadres de la page : avec trois vidéos, deux substituts restent
   * affichés par-dessus les vidéos activées. Trois stratégies, de la plus
   * explicite à la plus permissive :
   *
   *   1. data-substitut="id-du-placeholder" sur le cadre — appariement explicite ;
   *   2. le substitut le plus proche en remontant les ancêtres du cadre :
   *        <div class="video">
   *          <div data-consentement-substitut="marketing">…</div>
   *          <iframe data-consentement="marketing" data-src="…"></iframe>
   *        </div>
   *   3. aucun substitut : rien à masquer, ce n'est pas une erreur.
   *
   * Un substitut déjà apparié à un autre cadre n'est jamais réutilisé.
   */
  function substitutPour(cadre, dejaPris) {
    var id = cadre.getAttribute('data-substitut')
    if (id) {
      var explicite = document.getElementById(id)
      return explicite && dejaPris.indexOf(explicite) === -1 ? explicite : null
    }

    var parent = cadre.parentElement
    while (parent && parent !== document.body) {
      var candidats = parent.querySelectorAll('[data-consentement-substitut]')
      for (var i = 0; i < candidats.length; i++) {
        if (dejaPris.indexOf(candidats[i]) === -1) return candidats[i]
      }
      parent = parent.parentElement
    }
    return null
  }

  function activerCategorie(categorie) {
    var scripts = document.querySelectorAll(
      'script[type="text/plain"][data-consentement="' + categorie + '"]'
    )
    Array.prototype.forEach.call(scripts, function (ancien) {
      var nouveau = document.createElement('script')
      for (var i = 0; i < ancien.attributes.length; i++) {
        var attr = ancien.attributes[i]
        if (attr.name === 'type' || attr.name === 'data-src') continue
        nouveau.setAttribute(attr.name, attr.value)
      }
      if (ancien.dataset.src) nouveau.src = ancien.dataset.src
      else nouveau.textContent = ancien.textContent
      nouveau.setAttribute('data-consentement-actif', 'true')
      ancien.parentNode.replaceChild(nouveau, ancien)
    })

    var cadres = document.querySelectorAll(
      'iframe[data-consentement="' + categorie + '"][data-src]'
    )
    var apparies = []
    Array.prototype.forEach.call(cadres, function (cadre) {
      // Le substitut est résolu AVANT d'activer le cadre : une fois data-src
      // retiré, le cadre n'est plus reconnaissable comme en attente.
      var substitut = substitutPour(cadre, apparies)
      cadre.src = cadre.dataset.src
      cadre.removeAttribute('data-src')
      cadre.setAttribute('data-consentement-actif', 'true')
      if (substitut) {
        substitut.hidden = true
        apparies.push(substitut)
      }
    })
  }

  /**
   * Google Consent Mode v2 — obligatoire dans l'EEE si gtag est présent.
   *
   * ATTENTION : « update » ne suffit pas à lui seul. L'état par défaut doit
   * être posé en « denied » AVANT que gtag ne se charge, sinon la première
   * mesure part avant le consentement. Ce fichier ne peut pas le faire : il
   * s'exécute après le <head>. À coller tel quel dans le <head>, avant le
   * conteneur GTM :
   *
   *   <script>
   *     window.dataLayer = window.dataLayer || [];
   *     function gtag(){dataLayer.push(arguments);}
   *     gtag('consent', 'default', {
   *       analytics_storage: 'denied',
   *       ad_storage: 'denied',
   *       ad_user_data: 'denied',
   *       ad_personalization: 'denied',
   *       wait_for_update: 500
   *     });
   *   </script>
   *
   * Si le conteneur GTM est lui-même bloqué par ce script (type="text/plain"),
   * ce bloc reste une ceinture de sécurité utile : il couvre le cas où
   * quelqu'un rajoute gtag directement dans le <head> plus tard.
   */
  function majConsentMode() {
    if (typeof window.gtag !== 'function') return
    window.gtag('consent', 'update', {
      analytics_storage: etat.mesure ? 'granted' : 'denied',
      ad_storage: etat.marketing ? 'granted' : 'denied',
      ad_user_data: etat.marketing ? 'granted' : 'denied',
      ad_personalization: etat.marketing ? 'granted' : 'denied',
    })
  }

  function appliquer() {
    Object.keys(etat).forEach(function (cle) {
      if (cle !== 'necessaire' && etat[cle]) activerCategorie(cle)
    })
    majConsentMode()
    document.dispatchEvent(
      new CustomEvent('consentement:change', { detail: Object.assign({}, etat) })
    )
  }

  /* --------------------------------------------------------------- journal */

  function journaliser(action) {
    if (!CONFIG.urlJournal) return
    var charge = JSON.stringify({
      action: action,               // 'accepter' | 'refuser' | 'personnaliser' | 'retirer'
      categories: etat,
      version: CONFIG.version,
      horodatage: new Date().toISOString(),
      chemin: location.pathname,
    })
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.urlJournal, new Blob([charge], { type: 'application/json' }))
      } else {
        fetch(CONFIG.urlJournal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: charge,
          keepalive: true,
        }).catch(function () {})
      }
    } catch (e) { /* la journalisation ne doit jamais casser le site */ }
  }

  /* --------------------------------------------------------- enregistrement */

  function enregistrer(nouvelEtat, action) {
    var precedent = Object.assign({}, etat)
    etat = Object.assign({ necessaire: true }, nouvelEtat)
    ecrireCookie(
      CONFIG.nomCookie,
      JSON.stringify({
        version: CONFIG.version,
        categories: etat,
        date: new Date().toISOString(),
      }),
      CONFIG.dureeJours
    )
    journaliser(action)

    // Une catégorie retirée : on efface ses cookies et on recharge, car les
    // scripts déjà exécutés ne se désactivent pas à chaud.
    var retrait = Object.keys(etat).some(function (cle) {
      return precedent[cle] === true && etat[cle] === false
    })
    Object.keys(etat).forEach(function (cle) {
      if (!etat[cle]) effacerCookiesDe(cle)
    })

    fermer()
    if (retrait) { location.reload(); return }
    appliquer()
  }

  /* --------------------------------------------------------------- interface */

  var racine = null

  function echapper(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function construire(detaille) {
    if (racine) racine.remove()
    racine = document.createElement('div')
    racine.className = 'cnst'
    racine.setAttribute('role', 'dialog')
    racine.setAttribute('aria-modal', 'false')
    racine.setAttribute('aria-labelledby', 'cnst-titre')

    var options = CATEGORIES.map(function (c) {
      var coche = c.obligatoire || etat[c.cle] ? ' checked' : ''
      var verrou = c.obligatoire ? ' disabled' : ''
      return (
        '<div class="cnst-cat">' +
        '<label class="cnst-cat-tete">' +
        '<input type="checkbox" data-cat="' + c.cle + '"' + coche + verrou + '>' +
        '<span class="cnst-cat-titre">' + echapper(c.titre) + '</span>' +
        (c.obligatoire ? '<span class="cnst-badge">toujours actif</span>' : '') +
        '</label>' +
        '<p class="cnst-cat-texte">' + echapper(c.texte) + '</p>' +
        '</div>'
      )
    }).join('')

    racine.innerHTML =
      '<div class="cnst-boite">' +
      '<h2 class="cnst-titre" id="cnst-titre">Votre vie privée</h2>' +
      '<p class="cnst-texte">Nous utilisons des cookies pour faire fonctionner ce site et, ' +
      'avec votre accord, pour mesurer son audience et afficher des contenus externes. ' +
      'Vous pouvez changer d’avis à tout moment.</p>' +
      (detaille ? '<div class="cnst-cats">' + options + '</div>' : '') +
      '<div class="cnst-actions">' +
      '<button type="button" class="cnst-btn cnst-btn-principal" data-action="refuser">Tout refuser</button>' +
      '<button type="button" class="cnst-btn cnst-btn-principal" data-action="accepter">Tout accepter</button>' +
      (detaille
        ? '<button type="button" class="cnst-btn cnst-btn-secondaire" data-action="enregistrer">Enregistrer mes choix</button>'
        : '<button type="button" class="cnst-btn cnst-btn-secondaire" data-action="personnaliser">Personnaliser</button>') +
      '</div>' +
      '<p class="cnst-liens">' +
      '<a href="/politique-de-confidentialite">Politique de confidentialité</a>' +
      '<a href="/mentions-legales">Mentions légales</a>' +
      '</p>' +
      '</div>'

    racine.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]')
      if (!btn) return
      var action = btn.dataset.action
      if (action === 'accepter') {
        enregistrer({ mesure: true, marketing: true }, 'accepter')
      } else if (action === 'refuser') {
        enregistrer({ mesure: false, marketing: false }, choix ? 'retirer' : 'refuser')
      } else if (action === 'personnaliser') {
        construire(true)
      } else if (action === 'enregistrer') {
        var suivant = {}
        racine.querySelectorAll('input[data-cat]').forEach(function (i) {
          suivant[i.dataset.cat] = i.checked
        })
        enregistrer(suivant, 'personnaliser')
      }
    })

    document.body.appendChild(racine)
    var premier = racine.querySelector('button')
    if (premier) premier.focus()
  }

  function fermer() {
    if (racine) { racine.remove(); racine = null }
  }

  /* ------------------------------------------------------------------ api */

  window.Consentement = {
    ouvrir: function () { construire(true) },
    etat: function () { return Object.assign({}, etat) },
    aConsenti: function (categorie) { return etat[categorie] === true },
    reinitialiser: function () {
      effacerCookie(CONFIG.nomCookie)
      location.reload()
    },
  }

  /* -------------------------------------------------------------- démarrage */

  function demarrer() {
    if (choix) appliquer()   // choix déjà exprimé : on applique sans rien afficher
    else construire(false)   // premier passage : bandeau, aucun traceur actif
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer)
  } else {
    demarrer()
  }
})()
