import { getAuthenticatedUser } from "@/lib/auth/require-user";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    return Response.json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? null,
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
