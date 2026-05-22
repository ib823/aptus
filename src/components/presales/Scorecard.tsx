/**
 * Live scorecard for the Enhanced Workbench. Server-rendered: the
 * /c/s/[scopeCode] page passes already-computed counts (cheap — uses the
 * decisionStates Map it already loads). No client-side polling.
 *
 * Layout matches the mockup's `.wbh` panel: dark navy background, four
 * stat tiles, a progress bar showing % of L2 questions answered.
 */

interface Props {
  scopeTitle: string;
  scopeSubhead: string;
  totalQuestions: number;
  answeredQuestions: number;
  standardCount: number;
  discussCount: number;
  deviateCount: number;
}

export function Scorecard(props: Props) {
  const percentAnswered = props.totalQuestions === 0
    ? 0
    : Math.round((props.answeredQuestions / props.totalQuestions) * 100);
  const decisionTotal = props.standardCount + props.discussCount + props.deviateCount;
  const standardPct = decisionTotal === 0
    ? 0
    : Math.round((props.standardCount / decisionTotal) * 100);

  return (
    <div
      style={{
        background: '#002B5C',
        borderRadius: '12px 12px 0 0',
        padding: '16px 20px',
        color: '#FFFFFE',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {props.scopeTitle}
      </div>
      <div style={{ fontSize: 12, color: '#9DB4CE', marginTop: 2 }}>
        {props.scopeSubhead}
      </div>
      <div style={{ marginTop: 13, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Stat value={`${props.answeredQuestions} / ${props.totalQuestions}`} label="Questions answered" />
        <Stat value={`${standardPct}%`} label="Adopting SAP standard" />
        <Stat value={String(props.discussCount)} label="To discuss" />
        <Stat value={String(props.deviateCount)} label="Deviations" />
      </div>
      <div
        style={{
          height: 7,
          background: '#0B3A66',
          borderRadius: 4,
          marginTop: 12,
          overflow: 'hidden',
        }}
        aria-label={`Progress: ${percentAnswered}% answered`}
      >
        <div
          style={{
            display: 'block',
            height: '100%',
            background: '#3FA87B',
            width: `${percentAnswered}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        background: '#0B3A66',
        borderRadius: 8,
        padding: '9px 14px',
        minWidth: 118,
        flex: '0 0 auto',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFE' }}>{value}</div>
      <div
        style={{
          fontSize: 10.5,
          color: '#9DB4CE',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}
