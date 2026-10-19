import { z } from "zod";

export const JOURNEY_VERSION = 3;
export const MIN_PREPARATION_MS = 50_000;
export const MOBILE_RETURN = "/onboarding?experience=mobile";
export const answerSchema = z.record(z.string().max(60), z.union([z.string().max(4000), z.number().finite(), z.array(z.string().max(100)).max(10)]));
export const journeySchema = z.object({
  version: z.literal(3), step: z.string().max(60), initialPrompt: z.string().max(4000),
  answers: answerSchema, updatedAt: z.number().finite(),
});
export type Journey = z.infer<typeof journeySchema>;
export type Answers = Journey["answers"];
export type Step = { id: string; number?: string; type: "choice" | "multi" | "text" | "info" | "passive" | "gauge" | "scenario" | "auth"; title: string; body?: string; options?: string[]; other?: boolean; action?: string };
const experience = ["Jamais", "J'ai essayé", "Oui, j'en ai déjà créé"];
export const PRICE_CATEGORIES = ["Entre 0 et 500 €", "Entre 500 et 1 000 €", "Entre 1 500 et 3 000 €", "Plus de 3 000 €"];
const step = (id: string, number: string, type: Step["type"], title: string, options?: string[], body?: string, other = false): Step => ({ id, number, type, title, options, body, other });
export const STEPS: Record<string, Step> = Object.fromEntries([
  step("welcome", "01", "passive", "Bienvenue sur Stack32.", undefined, "Crée ton premier agent IA et donne vie à ton projet."),
  { ...step("definition", "02", "info", "Un agent IA, c'est quoi ?", undefined, "Un agent IA est un logiciel qui comprend un objectif, prend des décisions et agit avec les outils auxquels il a accès pour accomplir une tâche.\n\nAvec Stack32, tu peux créer un agent complètement autonome, capable de prendre en charge toutes les tâches."), action: "J'ai compris" },
  step("goal", "03", "choice", "Que souhaites-tu faire sur Stack32 ?", ["Lancer un business d'agents IA", "Gagner de l'argent grâce aux agents IA", "Automatiser mon activité"]),
  step("a.activity", "04A", "choice", "Quelle activité souhaites-tu automatiser ?", ["SaaS", "E-commerce", "Freelance", "Entreprise physique", "Association", "Autre"], undefined, true),
  step("a.experience", "05A", "choice", "As-tu déjà créé un agent IA ?", experience),
  step("a.tasks", "06A", "text", "Quelles sont les tâches qui te prennent le plus de temps dans ton activité ?", undefined, "Écris-en plusieurs, en commençant par celle que tu voudrais confier en premier à un agent IA."),
  step("a.frequency", "07A", "choice", "À quelle fréquence fais-tu cette tâche ?", ["Chaque jour", "Plusieurs fois par semaine", "Une fois par semaine", "Plus rarement"]),
  step("a.duration", "08A", "choice", "Combien de temps y consacres-tu à chaque fois ?", ["Moins de 15 min", "15 à 30 min", "30 à 60 min", "Plus d'1 h"]),
  step("a.tools", "09A", "text", "Quels outils ou applications utilises-tu pour accomplir ces tâches ?", undefined, "Indique ceux que tu connais."),
  step("a.blocker", "10A", "choice", "Qu'est-ce qui te bloque pour automatiser cette tâche ?", ["Je ne sais pas par où commencer", "Trop compliqué, pas les compétences", "Je veux garder le contrôle", "Je manque de temps", "Autre"], undefined, true),
  step("a.complexity", "", "info", "Une tâche pour commencer", undefined, "Décris simplement l'entrée, la décision et le résultat attendu. Commence avec une seule tâche."),
  step("a.benefit", "11A", "choice", "Quel résultat compte le plus pour toi ?", ["Gagner du temps", "Répondre plus vite", "Réduire les erreurs", "Ne plus oublier de demandes", "Autre"], undefined, true),
  step("a.analysis", "12A", "passive", "Nous rapprochons la fréquence, la durée et les outils indiqués."),
  step("a.suggestion", "13A", "info", "Une première piste pour ton activité"),
  step("a.explain", "14A", "info", "De la tâche à ton agent", undefined, "Décris la tâche, branche les sources utiles, teste l'agent et garde la validation humaine si nécessaire."),
  step("account", "", "auth", "Compte et sauvegarde", undefined, "Pour conserver ton projet et retrouver ton agent, crée un compte ou connecte-toi."),
  step("a.projection", "15A", "info", "Ta projection"),
  step("a.request", "16A", "text", "Décris une demande réelle que ton agent devrait traiter du début à la fin."),
  step("a.output", "17A", "choice", "Que doit-il produire ?", ["Un brouillon", "Une réponse prête à valider", "Un résumé", "Une action dans un outil", "Autre"], undefined, true),
  step("a.control", "18A", "choice", "Quand veux-tu vérifier son travail ?", ["Avant chaque envoi", "Sur les cas sensibles", "Après test et ajustement"]),
  step("a.success", "19A", "choice", "Comment sauras-tu qu'il t'aide vraiment ?", ["Temps gagné", "Délai de réponse", "Moins d'erreurs", "Plus de demandes traitées"]),
  step("a.plan", "20A", "info", "Ton plan de départ", undefined, "Tâche → source → résultat attendu → test sur un cas réel → validation → amélioration."),
  step("b.experience", "04B", "choice", "As-tu déjà créé un agent IA ?", experience),
  step("b.beginner", "", "info", "Avançons pas à pas", undefined, "Tu n'as encore jamais créé d'agent IA ou tu as déjà essayé.\n\nNous allons avancer pas à pas pour créer ton premier agent et préparer une première offre."),
  step("b.experienced", "", "info", "Construisons ton prochain agent", undefined, "Tu as déjà créé un agent IA.\n\nPartons d'un besoin client que tu connais pour construire ton prochain agent à vendre."),
  { ...step("b.business", "", "info", "Ton business d'agents IA", undefined, "Ensemble, nous allons créer un agent IA qui résout un vrai problème, puis le proposer à des clients.\n\nL'objectif : construire une activité qui peut te rapporter de l'argent grâce à tes agents."), action: "Construire mon projet" },
  step("b.time", "05B", "choice", "Combien de temps peux-tu consacrer à ce projet par semaine ?", ["Moins de 2 h", "2 à 5 h", "5 à 10 h", "Plus de 10 h"]),
  step("b.horizon", "06B", "choice", "Quand veux-tu lancer ton premier agent ?", ["Cette semaine", "Dans le mois", "Dans 3 mois", "J'explore encore"]),
  step("b.target", "07B", "gauge", "Quel revenu mensuel aimerais-tu atteindre dans 3 mois ?"),
  step("b.motivation", "08B", "choice", "Qu'est-ce que ce revenu changerait pour toi ?", ["Un complément", "Plus d'indépendance", "Vivre de mon activité", "Développer mon entreprise", "Autre"], undefined, true),
  step("b.analysis", "09B", "passive", "Nous relions ton objectif, ton temps et ton expérience pour préparer une première piste."),
  { ...step("b.suggestions", "10B", "info", "Trois premières pistes"), action: "Voir comment en faire une offre" },
  step("b.sale", "11B", "choice", "Comment aimerais-tu proposer ton premier agent ?", ["Je le crée pour un client", "Je le propose à plusieurs clients", "Je ne sais pas encore"], "Un même agent peut servir à un ou plusieurs clients."),
  step("b.acquisition", "12B", "choice", "Comment aimerais-tu trouver tes premiers clients ?", ["Mon réseau", "Prospection directe", "Contenu et réseaux sociaux", "Plateformes freelance", "J'ai besoin d'aide"]),
  step("b.clients", "", "info", "Tes premiers clients", undefined, "Montre un cas d'usage simple, contacte une cible précise et propose une démonstration."),
  step("b.describe", "13B · 1", "info", "Décris le travail de ton agent."),
  step("b.configure", "13B · 2", "info", "Configure, teste et améliore sa réponse."),
  step("b.present", "13B · 3", "info", "Présente-le et vends-le à tes clients."),
  step("b.projection", "14B", "info", "Ta projection financière", undefined, "Aujourd'hui : ta situation actuelle.\n\nTon plan Stack32 pour avancer vers ce cap."),
  step("b.sectors", "15B", "multi", "Dans quels secteurs aimerais-tu vendre ?", ["Commerce", "Services", "Immobilier", "Santé-bien-être", "Éducation", "Autre", "Je n'ai pas de préférence"], undefined, true),
  step("b.client", "16B", "choice", "À qui aimerais-tu vendre ton premier agent ?", ["Indépendants", "TPE", "PME", "E-commerçants", "Créateurs", "Je ne sais pas encore"]),
  step("b.problem", "17B", "choice", "Quel résultat ton agent devrait-il apporter ?", ["Gagner du temps", "Répondre plus vite", "Obtenir des prospects", "Améliorer le suivi", "Produire du contenu", "Autre"], undefined, true),
  step("b.price", "18B", "choice", "À combien souhaites-tu vendre ton agent IA ?", PRICE_CATEGORIES, "Le prix de vente de ton agent, distinct de ton abonnement Stack32."),
  step("b.hasIdea", "19B", "choice", "As-tu déjà une idée pour ton premier agent ?", ["Oui", "Non, aide-moi à choisir"]),
  step("b.idea", "20B-A", "text", "Quelle est ton idée d'agent IA ?"),
  step("b.guided", "20B-B", "choice", "Quel premier agent aimerais-tu explorer ?", ["Réponses clients", "Qualification de prospects", "Suivi commercial", "Production de contenu", "Une idée adaptée à mes réponses"]),
  { ...step("b.plan", "21B", "info", "Ton plan de départ", undefined, "Client cible → problème précis → agent pilote → test → démonstration → première offre."), action: "Voir mon scénario" },
  { ...step("b.scenario", "22B", "scenario", "Ton objectif à trois mois", undefined, "Ton plan : créer → tester → vendre ton agent."), action: "Préparer mon agent" },
  step("build", "", "passive", "Construction de ton agent IA"),
  { ...step("ready", "", "info", "Ton agent est prêt", undefined, "Ton agent IA est prêt à être utilisé."), action: "Utiliser cet agent" },
].map(s => [s.id, s]));

export function isAutomation(a: Answers) { return a.goal === STEPS.goal.options![2]; }
export function pathFor(a: Answers): string[] {
  const common = ["welcome", "definition", "goal"];
  if (!a.goal) return common;
  if (isAutomation(a)) return [...common, "a.activity", "a.experience", "a.tasks", "a.frequency", "a.duration", "a.tools", "a.blocker", ...(a["a.blocker"] === "Trop compliqué, pas les compétences" ? ["a.complexity"] : []), "a.benefit", "a.analysis", "a.suggestion", "a.explain", "account", "a.projection", "a.request", "a.output", "a.control", "a.success", "a.plan", "build", "ready"];
  const idea = a["b.hasIdea"] === "Oui" ? ["b.idea", ...(!String(a["b.idea"] ?? "").trim() ? ["b.guided"] : [])] : ["b.guided"];
  return [...common, "b.experience", a["b.experience"] === experience[2] ? "b.experienced" : "b.beginner", "b.business", "b.time", "b.horizon", "b.target", "b.motivation", "b.analysis", "b.suggestions", "b.sale", "b.acquisition", "b.clients", "b.describe", "b.configure", "b.present", "account", "b.projection", "b.sectors", "b.client", "b.problem", "b.price", "b.hasIdea", ...idea, "b.plan", "b.scenario", "build", "ready"];
}
export const TARGETS = Array.from({ length: 191 }, (_, i) => i <= 90 ? 1000 + i * 100 : 10000 + (i - 90) * 500);
export const DIFFICULTY_THRESHOLDS = { "Moins de 2 h": [1000, 2000, 5000], "2 à 5 h": [2000, 5000, 10000], "5 à 10 h": [3000, 10000, 20000], "Plus de 10 h": [5000, 15000, 30000] };
export function difficulty(a: Answers) {
  const thresholds = DIFFICULTY_THRESHOLDS[String(a["b.time"]) as keyof typeof DIFFICULTY_THRESHOLDS] ?? [1000, 2000, 5000];
  const target = Number(a["b.target"] ?? 1000);
  return ["Accessible", "Réaliste", "Ambitieux", "Très ambitieux"][thresholds.filter(n => target > n).length];
}
export function toggleSector(current: string[], value: string): string[] {
  if (value === "Je n'ai pas de préférence") return current.includes(value) ? [] : [value];
  return current.includes(value) ? current.filter(x => x !== value) : [...current.filter(x => x !== "Je n'ai pas de préférence"), value];
}
export function priceBounds(category: unknown) {
  const index = PRICE_CATEGORIES.indexOf(String(category));
  return [{ min: 0, max: 500, initial: 500 }, { min: 500, max: 1000, initial: 750 }, { min: 1500, max: 3000, initial: 2000 }, { min: 3000.01, max: undefined, initial: 3500 }][Math.max(0, index)];
}
export function referencePrice(a: Answers) {
  // This is a fixed, visible scenario assumption, never an observed sale price.
  // Ignore legacy editable values when resuming an older draft.
  return priceBounds(a["b.price"]).initial;
}
export function monthlySales(a: Answers): number | null {
  const price = referencePrice(a);
  return Number.isFinite(price) && price > 0 ? Math.ceil(Number(a["b.target"] ?? 1000) / price) : null;
}
export const euro = (amount: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
export function timeProjection(a: Answers): { current: string; target: string; assumptions: string } {
  const frequency = String(a["a.frequency"] ?? "");
  const duration = String(a["a.duration"] ?? "");
  const count = frequency === "Chaque jour" ? 5 : frequency === "Plusieurs fois par semaine" ? 3 : frequency === "Une fois par semaine" ? 1 : null;
  const minutes = duration === "15 à 30 min" ? 22.5 : duration === "30 à 60 min" ? 45 : null;
  if (!count || !minutes) return { current: `${frequency || "Fréquence non renseignée"} · ${duration || "Durée non renseignée"}`, target: "Un gain à mesurer sur un premier test", assumptions: "La fréquence ou la durée est une fourchette ouverte : aucun gain précis ne peut être calculé. Le test devra mesurer la part réellement automatisable." };
  return { current: `Environ ${Math.round(count * minutes)} min / semaine`, target: `Hypothèse : jusqu'à ${Math.round(count * minutes / 2)} min libérées / semaine`, assumptions: `Estimation illustrative : ${count} fois par semaine, ${minutes} min par tâche (milieu de la fourchette), 50 % de temps économisé si le test le confirme. Chaque jour = 5 jours ouvrés ; plusieurs fois = 3.` };
}
export function guidedBrief(a: Answers): string {
  const chosen = String(a["b.guided"] || "Une idée adaptée à mes réponses");
  const problem = String(a["b.problem"] || "Répondre plus vite");
  const type = chosen === "Une idée adaptée à mes réponses" ? (problem === "Produire du contenu" ? "Production de contenu" : problem === "Obtenir des prospects" ? "Qualification de prospects" : "Réponses clients") : chosen;
  const missions: Record<string, string> = {
    "Réponses clients": "Classer une demande client fournie, consulter les informations disponibles, puis préparer une réponse sourcée à valider. Demander les informations manquantes sans inventer de réponse.",
    "Qualification de prospects": "Qualifier les demandes entrantes fournies selon des critères explicites, résumer le besoin et proposer une prochaine étape à valider. Aucune prospection ou collecte massive.",
    "Suivi commercial": "Résumer les échanges commerciaux fournis, identifier la prochaine étape et préparer un brouillon de suivi à valider avant envoi.",
    "Production de contenu": "Transformer un brief fourni en brouillon de contenu adapté à la cible, vérifier les faits disponibles et demander une validation avant publication.",
  };
  return missions[type] ?? missions["Réponses clients"];
}
export function resolveBrief(draft: Journey): string {
  const a = draft.answers;
  const automation = isAutomation(a);
  const active = Object.entries(a).filter(([key]) => key.startsWith(automation ? "a." : "b.") && !key.endsWith("referencePrice") && !key.endsWith("idea") && !key.endsWith("guided"));
  const details = active.map(([key, value]) => `${STEPS[key]?.title ?? key}: ${Array.isArray(value) ? value.join(", ") : value}`).join("\n");
  const mission = automation ? String(a["a.request"] || a["a.tasks"] || "Préparer une réponse à une demande fournie, demander les éléments manquants et la faire valider.") : a["b.hasIdea"] === "Oui" && String(a["b.idea"] ?? "").trim() ? String(a["b.idea"]) : guidedBrief(a);
  return `${mission}\n\n${details}${automation && draft.initialPrompt ? `\nContexte d'entrée : ${draft.initialPrompt}` : ""}\nCommencer par un cas fourni par l'utilisateur. Ne pas inventer de connexions ni de données. Respecter les validations et permissions des outils.`.slice(0, 8000);
}
export function canContinue(s: Step, a: Answers): boolean {
  if (s.type === "choice") return Boolean(s.options?.includes(String(a[s.id] ?? "")));
  if (s.type === "multi") return Array.isArray(a[s.id]) && (a[s.id] as string[]).length > 0;
  return true;
}
