import {
  Grid,
  H1,
  H2,
  H3,
  Stack,
  Stat,
  Table,
  Text,
  useEffect,
  useHostTheme,
  useMemo,
  useState,
  type CSSProperties,
} from "cursor/canvas";

const REPORT_DATE = "10/14/2026";
const INACTIVITY_RANGE = "10/9/2026–10/14/2026";

const STEPS = [
  { n: "1", label: "10pm fetch data via UniUni API" },
  { n: "2", label: "Build Power BI daily performance report" },
  { n: "3", label: "Send messages to Microsoft Teams group chats" },
] as const;

const DSP_DELIVERY = [
  {
    dsp: "DSP1",
    total: 4850,
    delivered: 4811,
    delivery: 99.2,
    toBeDelivered: 12,
    returned: 24,
    returns: 0.5,
  },
  {
    dsp: "DSP2",
    total: 5120,
    delivered: 5089,
    delivery: 99.4,
    toBeDelivered: 0,
    returned: 20,
    returns: 0.4,
  },
  {
    dsp: "DSP3",
    total: 4380,
    delivered: 4275,
    delivery: 97.6,
    toBeDelivered: 58,
    returned: 32,
    returns: 0.7,
  },
  {
    dsp: "DSP4",
    total: 3920,
    delivered: 3783,
    delivery: 96.5,
    toBeDelivered: 92,
    returned: 30,
    returns: 0.8,
  },
];

/** Only driver inactivity is attributed to a DSP. */
const DRIVER_INACTIVITY_BY_DSP = [
  { dsp: "DSP1", five: 18, threeToFive: 26 },
  { dsp: "DSP2", five: 11, threeToFive: 19 },
  { dsp: "DSP3", five: 22, threeToFive: 31 },
  { dsp: "DSP4", five: 28, threeToFive: 36 },
];

/** Warehouse inactivity is facility-level, not by DSP. */
const WAREHOUSE_INACTIVITY = [{ site: "WH1", five: 14, threeToFive: 21 }];

/** Transit inactivity is network-level, not by DSP. */
const TRANSIT_INACTIVITY = [{ scope: "Transit (network)", five: 9, threeToFive: 14 }];

function AlertCount({ value, level }: { value: number; level: "5d" | "3to5d" }) {
  const theme = useHostTheme();
  const color =
    level === "5d" ? theme.chart.palette.darkAmber : theme.chart.palette.goldenYellow;
  return (
    <span style={{ color, fontWeight: 600 }}>
      {value.toLocaleString()}
    </span>
  );
}

function Pipeline() {
  const theme = useHostTheme();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((n) => (n + 1) % STEPS.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const box: CSSProperties = {
    height: 88,
    padding: "12px 14px",
    boxSizing: "border-box",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: theme.accent.primary,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    fontSize: 13,
    lineHeight: "18px",
    fontWeight: 600,
  };

  return (
    <Grid columns="1fr 28px 1fr 28px 1fr" gap={0} align="center">
      {STEPS.flatMap((item, i) => {
        const active = step === i;
        const out = [
          <div
            key={item.n}
            style={{
              ...box,
              background: active ? theme.accent.primary : theme.bg.editor,
              color: active ? theme.text.onAccent : theme.text.primary,
            }}
          >
            <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>Step {item.n}</div>
            {item.label}
          </div>,
        ];
        if (i < STEPS.length - 1) {
          out.push(
            <div
              key={`arrow-${i}`}
              style={{
                textAlign: "center",
                fontSize: 20,
                fontWeight: 700,
                color: theme.accent.primary,
                opacity: step === i ? 1 : 0.4,
              }}
            >
              →
            </div>
          );
        }
        return out;
      })}
    </Grid>
  );
}

export default function EwrPerformanceDashboard() {
  const deliverySorted = useMemo(
    () => [...DSP_DELIVERY].sort((a, b) => b.delivery - a.delivery),
    []
  );

  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <H1>Daily Performance Report</H1>
        <Text tone="secondary" size="small">
          Demo (anonymized and simplified sample)
        </Text>
      </Stack>
      <Pipeline />

      <Grid columns={3} gap={12}>
        <Stat value="98.3%" label="Delivery rate" tone="success" />
        <Stat value="0.7%" label="Return rate" tone="warning" />
        <Stat value="0.4%" label="Inactive rate" tone="danger" />
      </Grid>

      <H2>{REPORT_DATE} Delivery Performance</H2>
      <Table
        headers={[
          "DSP",
          "Total",
          "Delivered",
          "Delivery rate",
          "To be delivered",
          "Returned",
          "Return rate",
        ]}
        columnAlign={["left", "right", "right", "right", "right", "right", "right"]}
        striped
        rowTone={deliverySorted.map((r) =>
          r.delivery < 97 ? "danger" : r.delivery < 99 ? "warning" : "success"
        )}
        rows={deliverySorted.map((r) => [
          r.dsp,
          r.total.toLocaleString(),
          r.delivered.toLocaleString(),
          `${r.delivery.toFixed(1)}%`,
          r.toBeDelivered === 0 ? "0" : r.toBeDelivered.toLocaleString(),
          r.returned.toLocaleString(),
          `${r.returns.toFixed(1)}%`,
        ])}
      />

      <H2>Inactivity Report</H2>
      <Text tone="secondary" size="small">
        {INACTIVITY_RANGE} · red = ≥5 days no update · yellow = 3–5 days no update
      </Text>

      <Stack gap={6}>
        <H3>Driver inactivity by DSP</H3>
        <Text tone="tertiary" size="small">
          Driver-owned parcels only · attributed to DSP
        </Text>
        <Table
          headers={["DSP", "≥5 days", "3–5 days"]}
          columnAlign={["left", "right", "right"]}
          striped
          rows={DRIVER_INACTIVITY_BY_DSP.map((r) => [
            r.dsp,
            <AlertCount value={r.five} level="5d" />,
            <AlertCount value={r.threeToFive} level="3to5d" />,
          ])}
        />
      </Stack>

      <Stack gap={6}>
        <H3>Warehouse inactivity</H3>
        <Text tone="tertiary" size="small">
          Warehouse / hub scope · not split by DSP
        </Text>
        <Table
          headers={["Site", "≥5 days", "3–5 days"]}
          columnAlign={["left", "right", "right"]}
          striped
          rows={WAREHOUSE_INACTIVITY.map((r) => [
            r.site,
            <AlertCount value={r.five} level="5d" />,
            <AlertCount value={r.threeToFive} level="3to5d" />,
          ])}
        />
      </Stack>

      <Stack gap={6}>
        <H3>Transit inactivity</H3>
        <Text tone="tertiary" size="small">
          In transit between nodes · not attributed to any DSP
        </Text>
        <Table
          headers={["Scope", "≥5 days", "3–5 days"]}
          columnAlign={["left", "right", "right"]}
          striped
          rows={TRANSIT_INACTIVITY.map((r) => [
            r.scope,
            <AlertCount value={r.five} level="5d" />,
            <AlertCount value={r.threeToFive} level="3to5d" />,
          ])}
        />
      </Stack>
    </Stack>
  );
}
