// Hook to manage question popup state and answer submission

export function useQuestionPopup() {
  // TODO: Manage question display, timer, and answer submission via socket
  return {
    isOpen: false,
    question: null,
    timeLeft: 0,
    submitAnswer: (_answerIndex: number) => {},
  };
}
