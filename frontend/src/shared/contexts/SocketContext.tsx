import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { WebSocketEventSocket, type RealtimeSocket } from '../utils/WebSocketEventSocket';

interface SocketContextType {
  socket: RealtimeSocket | null;
  isConnected: boolean;
  /** `roomCode`, when already known, connects straight to that room's server. */
  connectSocket: (roomCode?: string | null) => void;
  disconnectSocket: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  connectSocket: () => {},
  disconnectSocket: () => {},
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<RealtimeSocket | null>(null);
  const currentTokenRef = useRef<string | null>(null);

  // NOTE: We do NOT auto-connect on mount.
  // The socket is only created after the user authenticates and calls connectSocket().

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.close();
      socketRef.current = null;
    }
    currentTokenRef.current = null;
    setSocket(null);
    setIsConnected(false);
  }, []);

  const connectSocket = useCallback((roomCode?: string | null) => {
    const token = sessionStorage.getItem('mm.session-token') ?? localStorage.getItem('mm.token');
    if (!token) return;

    // If a socket already exists with the same token, don't recreate it.
    // This prevents an infinite destroy-recreate loop when called repeatedly
    // while the socket is still connecting (isConnected hasn't flipped to true yet).
    if (socketRef.current && currentTokenRef.current === token) {
      return;
    }

    // Tear down any previous socket (e.g. token changed)
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.close();
      socketRef.current = null;
    }

    currentTokenRef.current = token;

    // A known room skips the gateway's extra connection and redirect.
    const room = roomCode && /^[A-Za-z0-9]{6}$/.test(roomCode) ? roomCode.toUpperCase() : null;
    const newSocket: RealtimeSocket = new WebSocketEventSocket(room ? `/ws?room=${room}` : '/ws', token);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectSocket, disconnectSocket }}>
      {children}
    </SocketContext.Provider>
  );
};
