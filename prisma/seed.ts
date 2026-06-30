import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });

  // Reset this demo user's entries so the seed is idempotent.
  await prisma.foodEntry.deleteMany({ where: { userId: user.id } });

  const today = new Date();
  const at = (hours: number) => {
    const d = new Date(today);
    d.setHours(hours, 0, 0, 0);
    return d;
  };

  await prisma.foodEntry.createMany({
    data: [
      {
        userId: user.id,
        name: "Oatmeal with berries",
        calories: 320,
        protein: 12,
        carbs: 54,
        fat: 6,
        mealType: "breakfast",
        consumedAt: at(8),
      },
      {
        userId: user.id,
        name: "Grilled chicken salad",
        calories: 450,
        protein: 40,
        carbs: 20,
        fat: 22,
        mealType: "lunch",
        consumedAt: at(13),
      },
      {
        userId: user.id,
        name: "Greek yogurt",
        calories: 150,
        protein: 15,
        carbs: 8,
        fat: 5,
        mealType: "snack",
        consumedAt: at(16),
      },
    ],
  });

  console.log(`Seeded demo user ${email} (password: password123) with 3 entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
