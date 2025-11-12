export const aboutPageContent = {
  backToChat: "Back to Chat",

  sections: {
    whatThisAssistantDoes: {
      title: "What This Assistant Does",
      content: {
        paragraph1: "This chatbot helps higher education institutions with cloud infrastructure questions by searching through the Cloud Infrastructure Community Program (CICP) knowledge base. It uses RAG (Retrieval-Augmented Generation) technology to provide accurate, source-backed answers about AWS, GCP, and cloud best practices specifically for higher education environments.",
        paragraph2: "Please note: this assistant does not currently save users' chat histories. If you want to keep a specific answer, you can copy any chatbot response using the square button shown below each bot response. Persistent chats are planned for a future release."
      }
    },

    background: {
      title: "Background",
      content: {
        paragraph1: "Internet2 approached the AWS Cloud Innovation Center at CalPoly to help build an assistant for the research and education cloud community. This tool helps answer questions related to past activities and presentations, making it easier for higher education institutions to access collective knowledge and best practices.",
        paragraph2: "We extend our sincere thanks to the AWS Cloud Innovation Center team at CalPoly for their collaboration with Internet2 in bringing this project to life:",
        teamMembers: [
          { name: "Darren Kraker", role: "Sr Solutions Architect" },
          { name: "Nick Riley", role: "Jr SDE" },
          { name: "Kartik Malunjkar", role: "Software Development Engineer Intern" }
        ],
        repositoryLabel: "View the original repository:",
        repositoryUrl: "https://github.com/cal-poly-dxhub/internet2-chatbot",
        repositoryText: "github.com/cal-poly-dxhub/internet2-chatbot"
      }
    },

    featuredQuestions: {
      title: "Featured Questions",
      description: "Click any question to start a conversation:",
      questionIds: ['3', '18', '24', '27', '30']
    },

    resourcesAndLinks: {
      title: "Resources and Links",
      cloudCommunityCalendars: {
        title: "Cloud Community Calendars",
        links: [
          {
            text: "CICP Calendar",
            url: "https://spaces.at.internet2.edu/spaces/cicp/pages/289113857/Cloud+Infrastructure+Community+Program+Calendar"
          },
          {
            text: "CCCG Calendar",
            url: "https://spaces.at.internet2.edu/pages/viewpage.action?pageId=94274248&spaceKey=CA&title=Higher%2BEd%2BCloud%2BCommunity"
          }
        ]
      },
      netPlusCloudPrograms: {
        title: "NET+ Cloud Programs",
        links: [
          {
            text: "NET+ AWS Homepage",
            url: "https://internet2.edu/services/amazon-web-services/"
          },
          {
            text: "NET+ GCP Homepage",
            url: "https://internet2.edu/services/google-cloud-platform/"
          }
        ]
      }
    },

    contactAndSupport: {
      title: "Contact and Support",
      cicpMembership: {
        title: "CICP Membership",
        name: "Bob Flynn, Program Manager",
        email: "bflynn@internet2.edu"
      },
      chatbotFeedback: {
        title: "Chatbot Feedback",
        description: "For bugs, suggestions, or improvements to this chatbot interface."
      }
    }
  }
};
