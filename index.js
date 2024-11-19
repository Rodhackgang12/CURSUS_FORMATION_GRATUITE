const { makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const Groq = require("groq-sdk");
const qrcode = require('qrcode-terminal');
const generateQRPDF = require('./generateQRPDF');
const sendPDFToTelegram = require('./sendPDFToTelegram');
const Tesseract = require('tesseract.js');

const groq = new Groq({ apiKey: "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" });
let groupId = null;

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function connectWhatsApp() {
    console.log("Initialisation pour se connecter à mon compte...");
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const socket = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
    });

    store.bind(socket.ev); // Lier le stockage au socket

    socket.ev.on("creds.update", saveCreds);

    // Gérer les mises à jour de la connexion
    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === "open") {
            console.log("Rodhackgang Bot opérationnel ✅");
        } else if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Reconnexion en cours...");
                connectWhatsApp();
            } else {
                console.log("Déconnexion permanente. Veuillez scanner à nouveau le QR code.");
            }
        }

        // Afficher le QR code dans un format scannable
        if (qr) {
            const pdfFilePath = await generateQRPDF(qr);

            // Envoyer le PDF au bot Telegram via l'API
            await sendPDFToTelegram(pdfFilePath);
        }
    });

    // Écouter les messages entrants
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
        console.log("Nouvelle détection de message:", messages);
        const message = messages[0];
        if (!message.key.fromMe) {
            const content = message.message?.conversation?.toLowerCase() || "";
            if (content === "#activer") {
                groupId = message.key.remoteJid;
                console.log(`Activation dans le groupe : ${groupId}`);
                // Lancer l'envoi de messages immédiatement après l'activation
                startSendingMessages(socket);
            }
        }
    });

    console.log("Bot opérationnel.");
}

// Fonction pour envoyer les messages
function startSendingMessages(socket) {
    // Lancer la requête immédiatement après l'activation
    sendTextMessage(socket);

    // Planifier les requêtes périodiques toutes les 3 minutes
    setInterval(async () => {
        await sendTextMessage(socket);
    }, 5 * 60 * 60 * 1000);
}

async function sendTextMessage(socket) {
    try {
        if (!groupId) {
            console.log("Aucun groupe activé pour l'envoi de messages.");
            return;
        }

        const responseText = await generateText();
        const humanizedText = humanizeResponse(responseText);

        // Envoyer le message texte humanisé
        await socket.sendMessage(groupId, {
            text: humanizedText
        });

    } catch (error) {
        console.error("Erreur lors de l'envoi du message :", error);
    }
}

// Fonction pour générer un texte
async function generateText() {
    const query = "Créez cinq questions à choix multiples adaptées à un concours national au Burkina Faso. Chaque question doit porter sur une matière différente, incluant les mathématiques, le français, l'anglais, les sciences,l'actualité, l'Histoire, la Géographie, la physique-chimie. Les questions doivent être variées et pertinentes, avec une seule bonne réponse parmi quatre mauvaises dans certaines questions, et deux ou trois bonnes réponses dans d'autres. Formulez toutes les questions et réponses en français, en évitant de mettre en évidence les bonnes réponses. Assurez-vous que les questions soient équilibrées entre difficulté moyenne et avancée.";
    try {
        const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: query }],
            model: "llama3-8b-8192"
        });
        return response.choices[0]?.message?.content || "Pas de réponse disponible.";
    } catch (error) {
        console.error("Erreur lors de la génération du texte :", error);
        return "Erreur lors de la génération du texte.";
    }
}

// Fonction pour humaniser la réponse avec un style adapté à WhatsApp
function humanizeResponse(responseText) {
    return `> 👋 *Salut tout le monde !* Voici 5 questions exclusives générées automatiquement par le robot intelligent de *Cursus Burkina* pour enrichir vos connaissances.

🎓 *Thème du jour :*

${responseText}

📌 *Pourquoi se limiter à ces 5 questions ?* Le grand groupe privé de Cursus vous offre :
- ✅ Un accès exclusif à des centaines de questions-réponses détaillées.
- ✅ Des quiz interactifs pour tester et renforcer vos compétences.
- ✅ Une communauté active d'apprenants motivés.

💭 *Imaginez ce que vous ratez en ne rejoignant pas ce groupe.* Une opportunité unique pour maîtriser vos sujets préférés à votre rythme !

🎯 *Investissez en vous-même pour seulement 3000 FCFA/an.* Ce petit prix peut transformer vos ambitions en réalité.

👉 *Envoyez "Je veux rejoindre" pour plus d'informations.*

🌟 *Rejoignez maintenant et démarquez-vous grâce à Cursus Burkina !*
`;
}


connectWhatsApp();

