import { APIGatewayProxyEventV2 } from "aws-lambda";
import { Resource } from "sst";
import { randomUUID } from "crypto";
import { z } from "zod";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const MovimientoInput = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  tipoMovimiento: z.enum(["ENTRADA", "SALIDA"]),
  cantidad: z.number().int().positive("La cantidad debe ser mayor que 0"),
});

export const crear = async (event: APIGatewayProxyEventV2) => {
  // 1. Parsear event.body (¡puede venir vacío o no ser JSON!)
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ errors: ["El cuerpo del JSON no es válido"] }),
      headers: { "Content-Type": "application/json" }
    };
  }
  // 2. safeParse → si falla, 400 con los errores
  const parsed = MovimientoInput.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 400,
      body: JSON.stringify({ errors: parsed.error.issues }),
      headers: { "Content-Type": "application/json" }
    };
  }
  // 3. Generar movimientoId (crypto.randomUUID()) y creadoEn
  const movimientoId = randomUUID();
  const creadoEn = new Date().toISOString();
  // 4. Put en Resource.Movimientos.name con estado "PENDIENTE"
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.Movimientos.name,
        Item: {
          movimientoId,
          ...parsed.data,
          estado: "PENDIENTE",
          creadoEn,
        },
      })
    );
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al guardar el movimiento" }),
      headers: { "Content-Type": "application/json" }
    };
  }
  // 5. 202 con { movimientoId }
  return {
    statusCode: 202,
    body: JSON.stringify({ movimientoId }),
    headers: { "Content-Type": "application/json" }
  };
};