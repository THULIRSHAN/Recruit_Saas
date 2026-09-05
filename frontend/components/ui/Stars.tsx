interface StarsProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}

export function Stars({ value, onChange, size = 16 }: StarsProps) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          style={{ color: n <= value ? '#b8791b' : '#e7e4de', fontSize: size }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
