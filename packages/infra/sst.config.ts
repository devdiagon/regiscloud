/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "regiscloud-infra",
      home: "aws",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: ["prod"].includes(input?.stage),
      providers: {
        aws: { profile: "inventario-lab", region: "us-east-1" },
      }
    };
  },
  async run() {
    const movimientos = new sst.aws.SnsTopic("MovimientosEvents");
    new aws.ssm.Parameter(`MovimientosEventsTopicArn`, {
      name: `/regiscloud/${$app.stage}/topics/movimientos-events-arn`,
      type: "String",
      value: movimientos.arn,
    });

    const inventario = new sst.aws.SnsTopic("InventarioEvents");
    new aws.ssm.Parameter(`InventarioEventsTopicArn`, {
      name: `/regiscloud/${$app.stage}/topics/inventario-events-arn`,
      type: "String",
      value: inventario.arn,
    });

    return {
      movimientosTopicArn: movimientos.arn,
      inventarioTopicArn: inventario.arn,
    }
  },
});
