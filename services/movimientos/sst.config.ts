/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "regiscloud-movimientos",
      home: "aws",
      removal: input?.stage === "prod" ? "retain" : "remove",
      protect: ["prod"].includes(input?.stage),
      providers: {
        aws: { profile: "inventario-lab", region: "us-east-1" },
      }
    };
  },
  async run() {
    const tabla = new sst.aws.Dynamo("Movimientos", {
      fields: { 
        movimientoId: "string"
       },
      primaryIndex: { hashKey: "movimientoId" },
    });

    const api = new sst.aws.ApiGatewayV2("MovimientosApi");
    api.route("POST /movimientos", {
      handler: "src/handlers/api.crear",
      link: [tabla],
    });

    // api.route("GET /movimientos", {
    //   handler: "src/handlers/api.listar",
    //   link: [tabla],
    // });

    // api.route("GET /movimientos/{id}", {
    //   handler: "src/handlers/api.verMovimiento",
    //   link: [tabla],
    // });

    // api.route("GET /health", {
    //   handler: "src/handlers/health.handler"
    // });

    return { url: api.url };
  },
});
