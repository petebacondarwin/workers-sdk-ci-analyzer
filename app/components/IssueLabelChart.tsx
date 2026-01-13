// Re-export LabelChart as IssueLabelChart for backwards compatibility
import LabelChart from './LabelChart';

interface IssueLabelChartProps {
  data: {
    timestamps: number[];
    total: number[];
    labels: Record<string, number[]>;
  };
  loading?: boolean;
  error?: string | null;
}

export default function IssueLabelChart(props: IssueLabelChartProps) {
  return <LabelChart {...props} itemType="issue" />;
}
