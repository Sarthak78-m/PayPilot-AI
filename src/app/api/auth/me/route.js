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

    const name =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      (user.email ? user.email.split("@")[0] : null);

    return Response.json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        name,
      },
    });
  } catch {
    return Response.json(
      { status: "error", message: "Authentication service is unavailable." },
      { status: 503 },
    );
  }
}
