'use client';

import React, { useState } from 'react';

interface HostTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  transferHost: (newEmail: string) => Promise<void>;
  chefAvatars: Record<string, { avatar: string; isReady: boolean }>;
  currentUserEmail: string;
}

const HostTransferModal: React.FC<HostTransferModalProps> = ({
  isOpen,
  onClose,
  isHost,
  transferHost,
  chefAvatars,
  currentUserEmail,
}) => {
  const [selectedChef, setSelectedChef] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !isHost) return null;

  const handleTransfer = async () => {
    if (!selectedChef) return;
    if (selectedChef.toLowerCase() === currentUserEmail.toLowerCase()) {
      setError('No puedes transferirte el rol a ti mismo');
      return;
    }

    setTransferring(true);
    setError(null);

    try {
      await transferHost(selectedChef);
      onClose();
      setSelectedChef(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al transferir');
    } finally {
      setTransferring(false);
    }
  };

  // Get list of chefs from presence (exclude current user)
  const chefs = Object.entries(chefAvatars)
    .filter(([name]) => name.toLowerCase() !== currentUserEmail.toLowerCase())
    .map(([name, data]) => ({ name, ...data }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-black/80 border border-white/10 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in duration-200">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black italic uppercase tracking-tight">
            Transferir <span className="text-kitchen-hot">Rol de Maître</span>
          </h2>
          <p className="text-white/40 font-mono text-xs mt-2 uppercase tracking-widest">
            Selecciona al chef que será el nuevo host
          </p>
        </div>

        {chefs.length === 0 ? (
          <div className="text-center py-8 text-white/40 font-mono text-sm">
            No hay otros chefs conectados
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto mb-6">
            {chefs.map((chef) => (
              <button
                key={chef.name}
                onClick={() => setSelectedChef(chef.name)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                  selectedChef === chef.name
                    ? 'border-kitchen-cool bg-kitchen-cool/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <span className="text-2xl">{chef.avatar}</span>
                <span className="font-bold text-white">{chef.name}</span>
                {selectedChef === chef.name && (
                  <span className="ml-auto text-kitchen-cool">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-kitchen-hot/20 border border-kitchen-hot/30 rounded-xl text-kitchen-hot text-sm font-mono text-center">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl border-2 border-white/10 bg-white/5 font-bold text-white/60 hover:bg-white/10 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedChef || transferring}
            className="flex-1 py-4 rounded-2xl bg-kitchen-hot font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-kitchen-hot/80 transition-all"
          >
            {transferring ? 'TRANSFIRIENDO...' : 'CONFIRMAR TRANSFER'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostTransferModal;
