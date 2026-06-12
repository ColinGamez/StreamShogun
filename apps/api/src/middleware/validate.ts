import type { FastifyRequest, FastifyReply } from "fastify";
import { ZodError, type ZodSchema } from "zod";

/**
 * Creates a Fastify preValidation hook that validates request.body against a Zod schema.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      request.body = schema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(400).send({
          error: "Validation Error",
          message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        });
        return;
      }
      throw err;
    }
  };
}
