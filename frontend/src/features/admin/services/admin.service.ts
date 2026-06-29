// Admin API service

export const adminService = {
  // Questions
  getQuestions: async () => { /* TODO */ },
  createQuestion: async (_data: unknown) => { /* TODO */ },
  updateQuestion: async (_id: string, _data: unknown) => { /* TODO */ },
  deleteQuestion: async (_id: string) => { /* TODO */ },

  // Skills
  getSkills: async () => { /* TODO */ },
  createSkill: async (_data: unknown) => { /* TODO */ },
  updateSkill: async (_id: string, _data: unknown) => { /* TODO */ },
  deleteSkill: async (_id: string) => { /* TODO */ },

  // Users
  getUsers: async () => { /* TODO */ },
  updateUser: async (_id: string, _data: unknown) => { /* TODO */ },
};
