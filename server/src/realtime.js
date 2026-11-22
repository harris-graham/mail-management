'use strict';

const { Server } = require('socket.io');
const { verifyAccessToken } = require('./lib/tokens');
const logger = require('./lib/logger');

let io = null;

function initSocket(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing token'));
      const payload = verifyAccessToken(token);
      socket.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.sub}`);
    if (socket.user.departmentId) {
      socket.join(`department:${socket.user.departmentId}`);
    }
    if (socket.user.role === 'admin') socket.join('role:admin');
    logger.debug({ userId: socket.user.sub }, 'Socket connected');
    socket.on('disconnect', () => {
      logger.debug({ userId: socket.user.sub }, 'Socket disconnected');
    });
  });

  return io;
}

function getIo() {
  return io;
}

function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

function emitToDepartment(departmentId, event, payload) {
  io?.to(`department:${departmentId}`).emit(event, payload);
}

function emitToAll(event, payload) {
  io?.emit(event, payload);
}

module.exports = { initSocket, getIo, emitToUser, emitToDepartment, emitToAll };
