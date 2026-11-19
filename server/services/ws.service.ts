import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { ENV } from '../config/env.ts';

interface ConnectedClient {
  ws: WebSocket;
  role: 'ADMIN' | 'SISWA';
  schoolId: string;
  profileId: string;
  examId?: string;
}

const clients = new Set<ConnectedClient>();

export function initWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token') || '';
      const examId = url.searchParams.get('examId') || undefined;
      if (!token) {
        ws.close(4001, 'Unauthorized');
        return;
      }
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as {
        profileId: string;
        schoolId: string;
        role: 'ADMIN' | 'SISWA';
      };

      const client: ConnectedClient = {
        ws,
        role: decoded.role,
        schoolId: decoded.schoolId,
        profileId: decoded.profileId,
        examId,
      };
      clients.add(client);

      ws.send(JSON.stringify({ type: 'connected', serverTime: new Date().toISOString() }));

      ws.on('close', () => {
        clients.delete(client);
      });
      ws.on('error', () => {
        clients.delete(client);
      });
    } catch {
      ws.close(4001, 'Invalid token');
    }
  });
}

export function broadcastMonitoringEvent(schoolId: string, event: { type: string; examId: string; payload?: unknown }) {
  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  });
  for (const client of clients) {
    if (client.role === 'ADMIN' && client.schoolId === schoolId && client.ws.readyState === WebSocket.OPEN) {
      if (!client.examId || client.examId === event.examId) {
        client.ws.send(message);
      }
    }
  }
}
