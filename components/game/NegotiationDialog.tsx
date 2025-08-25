import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, AlertTriangle } from 'lucide-react';
import { Player } from '@/types/game';
import SocketClient from '@/lib/socket';

interface NegotiationDialogProps {
  targetPlayer: Player;
  onClose: () => void;
  roomId: string;
}

export default function NegotiationDialog({ targetPlayer, onClose, roomId }: NegotiationDialogProps) {
  const [isWaiting, setIsWaiting] = useState(false);
  const [response, setResponse] = useState<'pending' | 'accepted' | 'rejected'>('pending');

  const sendNegotiationRequest = () => {
    setIsWaiting(true);
    SocketClient.emit('negotiate', {
      roomId,
      targetPlayerId: targetPlayer.id,
    });

    // Listen for response
    SocketClient.on('negotiation-response', (data) => {
      if (data.fromPlayerId === targetPlayer.id) {
        setResponse(data.givePart ? 'accepted' : 'rejected');
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">التفاوض مع {targetPlayer.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {response === 'pending' && (
          <>
            {!isWaiting ? (
              <div className="space-y-4">
                <p className="text-gray-300" dir="rtl">
                  هل تريد طلب القطعة من هذا اللاعب؟
                </p>
                
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <AlertTriangle size={20} />
                    <span className="text-sm">تذكر: قد يعطيك قطعة معطوبة!</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={sendNegotiationRequest}
                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all"
                  >
                    طلب القطعة
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 bg-gray-700 text-gray-300 font-bold rounded-lg hover:bg-gray-600 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-gray-300">في انتظار رد {targetPlayer.name}...</p>
              </div>
            )}
          </>
        )}

        {response === 'accepted' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center py-8"
          >
            <div className="text-6xl mb-4">✅</div>
            <p className="text-green-400 text-xl font-bold">تم قبول الطلب!</p>
            <p className="text-gray-400 mt-2">حصلت على القطعة</p>
          </motion.div>
        )}

        {response === 'rejected' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center py-8"
          >
            <div className="text-6xl mb-4">❌</div>
            <p className="text-red-400 text-xl font-bold">تم رفض الطلب</p>
            <p className="text-gray-400 mt-2">اللاعب رفض إعطاءك القطعة</p>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
