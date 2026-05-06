// components/JawTimer.tsx
interface JawTimerProps {
  seconds: number;
}

const JawTimer: React.FC<JawTimerProps> = ({ seconds }) => {
  if (!seconds) return null;

  return (
    <div 
      className="fixed top-5 right-5 text-white px-5 py-3 rounded-xl font-bold z-50 flex items-center gap-3 backdrop-blur-lg shadow-lg border-2"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        borderColor: '#ff9800',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
        animation: 'timer-pulse 1s infinite'
      }}
    >
      <span className="text-xl animate-jaw-pulse">🦷</span>
      Jaw Clench: <span className="text-blue-300">{seconds}</span> seconds
    </div>
  );
};

export default JawTimer;