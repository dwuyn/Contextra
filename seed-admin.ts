import { prisma } from "./src/lib/prisma";
import { hashPassword } from "./src/lib/auth";

async function main() {
  const email = "admin@test.com";
  const password = "admin";
  const name = "Admin User";

  console.log(`Checking if user ${email} exists...`);
  
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log("User already exists. Skipping creation.");
    return;
  }

  const passwordHash = await hashPassword(password);
  
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
    },
  });

  console.log(`User created successfully with ID: ${user.id}`);
  
  // Also create a sample project for the admin so they have something to see
  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: "My First Story",
      genre: "Fantasy",
      summary: "An epic journey into the unknown.",
      mode: "personal",
      branches: {
        create: {
          id: "main",
          name: "Main",
          description: "Primary story line",
          basedOnChapterId: "root",
          status: "active",
        },
      },
      chapters: {
        create: {
          title: "The Beginning",
          content: "<p>Once upon a time, in a land far away...</p>",
          summary: "Introduction to the world.",
          index: 1,
          branchId: "main"
        }
      }
    },
  });

  console.log(`Sample project created: ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
