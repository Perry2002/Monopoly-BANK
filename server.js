const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

let rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('createRoom', (userName) => {
    const roomId = generateRoomId();
    rooms[roomId] = { users: {}, transactions: [] };
    rooms[roomId].users[userName] = { id: socket.id, balance: 1500, transactions: [] };
    socket.join(roomId);
    socket.emit('roomCreated', roomId, userName, 1500);
    console.log(`Room created with ID: ${roomId} by ${userName}`);
  });

  socket.on('joinRoom', (roomId, userName) => {
    if (rooms[roomId]) {
      socket.join(roomId);
      rooms[roomId].users[userName] = { id: socket.id, balance: 1500, transactions: [] };
      socket.emit('roomJoined', roomId, 1500, userName);
      io.to(roomId).emit('userJoined', userName);
      console.log(`User ${userName} joined room: ${roomId}`);
    } else {
      socket.emit('error', 'Room does not exist');
    }
  });

  socket.on('transaction', (roomId, fromUser, toUser, amount) => {
    if (rooms[roomId] && rooms[roomId].users[fromUser] && rooms[roomId].users[toUser]) {
      const fromUserBalance = rooms[roomId].users[fromUser].balance;
      if (fromUserBalance >= amount) {
        rooms[roomId].users[fromUser].balance -= amount;
        rooms[roomId].users[toUser].balance += amount;

        const transaction = { from: fromUser, to: toUser, amount, date: new Date() };
        rooms[roomId].transactions.push(transaction);
        rooms[roomId].users[fromUser].transactions.push(transaction);
        rooms[roomId].users[toUser].transactions.push(transaction);

        io.to(rooms[roomId].users[fromUser].id).emit('balanceUpdate', rooms[roomId].users[fromUser].balance);
        io.to(rooms[roomId].users[toUser].id).emit('balanceUpdate', rooms[roomId].users[toUser].balance);
        io.to(roomId).emit('transactionUpdate', transaction);

        console.log(`Transaction from ${fromUser} to ${toUser} of amount ${amount} in room ${roomId}`);
      } else {
        socket.emit('error', 'Insufficient balance');
      }
    } else {
      socket.emit('error', 'Invalid transaction');
    }
  });

  socket.on('getTransactionHistory', (roomId, userName) => {
    if (rooms[roomId] && rooms[roomId].users[userName]) {
      socket.emit('transactionHistory', rooms[roomId].users[userName].transactions);
    } else {
      socket.emit('error', 'User or room does not exist');
    }
  });

  socket.on('getParticipants', (roomId) => {
    if (rooms[roomId]) {
      const participants = Object.keys(rooms[roomId].users);
      socket.emit('participantsList', participants);
    } else {
      socket.emit('error', 'Room does not exist');
    }
  });

  socket.on('addMoney', (roomId, userName, amount) => {
    if (rooms[roomId] && rooms[roomId].users[userName]) {
      rooms[roomId].users[userName].balance += amount;
      io.to(rooms[roomId].users[userName].id).emit('balanceUpdate', rooms[roomId].users[userName].balance);
      console.log(`${userName} received ${amount} in room ${roomId}`);
    } else {
      socket.emit('error', 'User or room does not exist');
    }
  });

  socket.on('disconnect', () => {
    for (let roomId in rooms) {
      for (let user in rooms[roomId].users) {
        if (rooms[roomId].users[user].id === socket.id) {
          delete rooms[roomId].users[user];
        }
      }
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
      }
    }
    console.log('A user disconnected');
  });
});

function generateRoomId() {
  return Math.random().toString(36).substr(2, 9);
}


server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

