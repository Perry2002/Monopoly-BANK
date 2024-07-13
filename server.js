// Importation des modules nécessaires
const express = require('express');  // Framework web pour Node.js
const http = require('http');        // Module pour créer un serveur HTTP
const socketIo = require('socket.io');  // Module pour la communication en temps réel via WebSockets
const path = require('path');        // Module pour gérer les chemins de fichiers

// Initialisation des objets principaux
const app = express();  // Création d'une application Express
const server = http.createServer(app);  // Création d'un serveur HTTP en utilisant l'application Express
const io = socketIo(server);  // Initialisation de Socket.io avec le serveur HTTP

// Définition du port
const PORT = process.env.PORT || 3000;  // Utilisation du port spécifié dans les variables d'environnement ou 3000 par défaut

// Initialisation des salles de jeu
let rooms = {};

// Configuration pour servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));  // Sert les fichiers statiques du répertoire 'public'

// Route pour servir la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');  // Envoie le fichier HTML de l'index en réponse
});

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log('A user connected');  // Log lorsque qu'un utilisateur se connecte

  // Création d'une nouvelle salle de jeu
  socket.on('createRoom', (userName) => {
    const roomId = generateRoomId();  // Génère un ID unique pour la salle
    rooms[roomId] = { users: {}, transactions: [] };  // Initialise la salle avec des utilisateurs et des transactions vides
    rooms[roomId].users[userName] = { id: socket.id, balance: 1500, transactions: [] };  // Ajoute l'utilisateur à la salle avec un solde initial de 1500
    socket.join(roomId);  // L'utilisateur rejoint la salle
    socket.emit('roomCreated', roomId, userName, 1500);  // Envoie un événement au client indiquant que la salle a été créée
    console.log(`Room created with ID: ${roomId} by ${userName}`);  // Log la création de la salle
  });

  // Rejoindre une salle existante
  socket.on('joinRoom', (roomId, userName) => {
    if (rooms[roomId]) {  // Vérifie si la salle existe
      socket.join(roomId);  // L'utilisateur rejoint la salle
      rooms[roomId].users[userName] = { id: socket.id, balance: 1500, transactions: [] };  // Ajoute l'utilisateur à la salle avec un solde initial de 1500
      socket.emit('roomJoined', roomId, 1500, userName);  // Envoie un événement au client indiquant que l'utilisateur a rejoint la salle
      io.to(roomId).emit('userJoined', userName);  // Notifie tous les utilisateurs de la salle qu'un nouvel utilisateur a rejoint
      console.log(`User ${userName} joined room: ${roomId}`);  // Log l'ajout de l'utilisateur à la salle
    } else {
      socket.emit('error', 'Room does not exist');  // Envoie un message d'erreur si la salle n'existe pas
    }
  });

  // Gestion des transactions entre utilisateurs
  socket.on('transaction', (roomId, fromUser, toUser, amount) => {
    if (rooms[roomId] && rooms[roomId].users[fromUser] && rooms[roomId].users[toUser]) {  // Vérifie que la salle et les utilisateurs existent
      const fromUserBalance = rooms[roomId].users[fromUser].balance;  // Récupère le solde de l'utilisateur initiateur
      if (fromUserBalance >= amount) {  // Vérifie que l'utilisateur initiateur a suffisamment de solde
        rooms[roomId].users[fromUser].balance -= amount;  // Déduit le montant du solde de l'utilisateur initiateur
        rooms[roomId].users[toUser].balance += amount;  // Ajoute le montant au solde du bénéficiaire

        const transaction = { from: fromUser, to: toUser, amount, date: new Date() };  // Crée un objet transaction
        rooms[roomId].transactions.push(transaction);  // Ajoute la transaction à l'historique des transactions de la salle
        rooms[roomId].users[fromUser].transactions.push(transaction);  // Ajoute la transaction à l'historique des transactions de l'utilisateur initiateur
        rooms[roomId].users[toUser].transactions.push(transaction);  // Ajoute la transaction à l'historique des transactions du bénéficiaire

        io.to(rooms[roomId].users[fromUser].id).emit('balanceUpdate', rooms[roomId].users[fromUser].balance);  // Met à jour le solde de l'utilisateur initiateur
        io.to(rooms[roomId].users[toUser].id).emit('balanceUpdate', rooms[roomId].users[toUser].balance);  // Met à jour le solde du bénéficiaire
        io.to(roomId).emit('transactionUpdate', transaction);  // Notifie tous les utilisateurs de la salle de la nouvelle transaction

        console.log(`Transaction from ${fromUser} to ${toUser} of amount ${amount} in room ${roomId}`);  // Log la transaction
      } else {
        socket.emit('error', 'Insufficient balance');  // Envoie un message d'erreur si le solde est insuffisant
      }
    } else {
      socket.emit('error', 'Invalid transaction');  // Envoie un message d'erreur si les utilisateurs ou la salle n'existent pas
    }
  });

  // Récupération de l'historique des transactions pour un utilisateur
  socket.on('getTransactionHistory', (roomId, userName) => {
    if (rooms[roomId] && rooms[roomId].users[userName]) {  // Vérifie que la salle et l'utilisateur existent
      socket.emit('transactionHistory', rooms[roomId].users[userName].transactions);  // Envoie l'historique des transactions au client
    } else {
      socket.emit('error', 'User or room does not exist');  // Envoie un message d'erreur si l'utilisateur ou la salle n'existent pas
    }
  });

  // Récupération de la liste des participants d'une salle
  socket.on('getParticipants', (roomId) => {
    if (rooms[roomId]) {  // Vérifie que la salle existe
      const participants = Object.keys(rooms[roomId].users);  // Récupère la liste des utilisateurs de la salle
      socket.emit('participantsList', participants);  // Envoie la liste des participants au client
    } else {
      socket.emit('error', 'Room does not exist');  // Envoie un message d'erreur si la salle n'existe pas
    }
  });

  // Ajout de fonds à un utilisateur
  socket.on('addMoney', (roomId, userName, amount) => {
    if (rooms[roomId] && rooms[roomId].users[userName]) {  // Vérifie que la salle et l'utilisateur existent
      rooms[roomId].users[userName].balance += amount;  // Ajoute le montant au solde de l'utilisateur
      io.to(rooms[roomId].users[userName].id).emit('balanceUpdate', rooms[roomId].users[userName].balance);  // Met à jour le solde de l'utilisateur
      console.log(`${userName} received ${amount} in room ${roomId}`);  // Log l'ajout de fonds
    } else {
      socket.emit('error', 'User or room does not exist');  // Envoie un message d'erreur si l'utilisateur ou la salle n'existent pas
    }
  });

  socket.on('subtractMoney', (roomId, userName, amount) => {
    if (rooms[roomId] && rooms[roomId].users[userName]) {
        // Émettre un événement de confirmation vers le client
        io.to(rooms[roomId].users[userName].id).emit('confirmSubtractMoney', {
            roomId: roomId,
            userName: userName,
            amount: amount
        });
    } else {
        socket.emit('error', 'User or room does not exist');
    }
});

// Écouter la confirmation de l'utilisateur
socket.on('confirmSubtractMoneyResponse', (response) => {
    const { roomId, userName, amount, confirmed } = response;
    if (confirmed && rooms[roomId] && rooms[roomId].users[userName]) {
        rooms[roomId].users[userName].balance -= amount;
        io.to(rooms[roomId].users[userName].id).emit('balanceUpdate', rooms[roomId].users[userName].balance);
        console.log(`${userName} had ${amount} subtracted in room ${roomId}`);
    } else if (!confirmed) {
        io.to(rooms[roomId].users[userName].id).emit('subtractMoneyCancelled');
    } else {
        socket.emit('error', 'User or room does not exist');
    }
});


  // Gestion de la déconnexion d'un utilisateur
  socket.on('disconnect', () => {
    for (let roomId in rooms) {  // Parcourt toutes les salles
      for (let user in rooms[roomId].users) {  // Parcourt tous les utilisateurs de chaque salle
        if (rooms[roomId].users[user].id === socket.id) {  // Vérifie si l'utilisateur déconnecté est dans la salle
          delete rooms[roomId].users[user];  // Supprime l'utilisateur de la salle
        }
      }
      if (Object.keys(rooms[roomId].users).length === 0) {  // Vérifie si la salle est vide
        delete rooms[roomId];  // Supprime la salle si elle est vide
      }
    }
    console.log('A user disconnected');  // Log la déconnexion de l'utilisateur
  });
});

// Fonction pour générer un ID de salle unique
function generateRoomId() {
  return Math.random().toString(36).substr(2, 9);  // Génère un ID unique en utilisant une chaîne aléatoire
}

// Démarrage du serveur
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);  // Log lorsque le serveur démarre
});
