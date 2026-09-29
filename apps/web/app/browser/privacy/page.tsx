export default function ChromePrivacy() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">
        Stack32 Chrome BETA — Confidentialité / Privacy
      </h1>
      <p>
        Cette extension de test relie uniquement l’onglet choisi à votre propre
        compte Stack32 de pré-production. Elle transmet le site autorisé, les
        régions de texte demandées (4 000 caractères maximum) et les résultats
        des actions approuvées à Stack32 pour exécuter votre tâche. Ces données
        peuvent être traitées par le fournisseur de modèle configuré pour votre
        agent et enregistrées dans votre conversation selon sa durée de
        conservation. Aucun historique de navigation, cookie, mot de passe ou
        contenu d’un autre onglet n’est collecté.
      </p>
      <p>
        L’accès dure au maximum 15 minutes. Gardez la fenêtre de l’extension et
        la page de connexion Stack32 ouvertes. Arrêter ou retirer l’accès
        invalide la session. Fermer une fenêtre ou se déconnecter interrompt les
        nouvelles actions dès détection ; le serveur refuse une session dont la
        présence n’a pas été confirmée depuis 30 secondes. Les commandes
        temporaires sont supprimées après résultat ou révocation ; les sessions
        expirées sont purgées lors de l’ouverture de la session suivante. Les
        résultats déjà ajoutés à la conversation suivent sa conservation
        habituelle.
      </p>
      <p>
        Les données ne sont ni vendues ni utilisées pour la publicité. Les
        destinataires et le contenu des formulaires sont affichés localement
        avant confirmation. Chaque extrait lu reste dans la fenêtre de
        l’extension jusqu’à votre accord pour le transmettre. N’autorisez aucune
        action si vous ne pouvez pas en vérifier les conséquences. Pour
        supprimer les données de conversation, utilisez les contrôles de
        suppression de votre compte Stack32. La publication est réservée aux
        comptes de test.
      </p>
      <p>
        This test extension connects only your selected tab to your own Stack32
        preproduction account. It transmits the authorized site, requested text
        regions (up to 4,000 characters) and approved action results to carry
        out your task. Your agent’s configured model provider may process these
        results, and conversation retention applies. Browsing history, cookies,
        passwords and other tabs are not collected. No data is sold or used for
        advertising.
      </p>
      <p>
        Access expires after 15 minutes. Keep both control windows open.
        Stop/revoke invalidates the session. Closing a window or signing out
        stops new actions upon detection; server presence expires within 30
        seconds. Temporary commands are deleted after a result or revocation;
        expired sessions are purged when the next session is opened.
        Conversation results follow normal account retention and deletion
        controls. Read snapshots remain local until you approve sharing them.
        Inspect exact form values before confirming; otherwise decline and act
        manually.
      </p>
      <p>
        <a className="underline" href="/legal/privacy">
          Responsable de traitement, contact et droits / Data controller,
          contact and rights
        </a>
      </p>
      <p>Version 0.1.0 — test privé uniquement / private testing only.</p>
    </main>
  );
}
