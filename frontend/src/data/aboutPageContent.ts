export const aboutPageContent = {
  backToChat: "Back to Chat",

  sections: {
    whatThisAssistantDoes: {
      title: "What This Assistant Does",
      tagline: "Instant access to collective knowledge from the higher ed cloud community",
      content: {
        description: [
          "This chatbot helps higher education institutions answer cloud infrastructure questions by drawing on community presentations and discussions from the Internet2 Cloud Infrastructure Community Program (",
          { text: "CICP", url: "https://internet2.edu/cicp" },
          ") and the Internet2/EDUCAUSE Cloud Computing Community Group archives. It uses Retrieval-Augmented Generation (",
          { text: "RAG", url: "https://en.wikipedia.org/wiki/Retrieval-augmented_generation" },
          ") to provide accurate, source-backed answers about cloud best practices for higher education."
        ],
        privacyNote: "Chat history is not saved between sessions. To keep a response, use the copy button below any bot message."
      }
    },

    background: {
      title: "Background",
      content: {
        paragraph: "Internet2 partnered with the AWS Cloud Innovation Center at CalPoly to build an assistant for the research and education cloud community, making it easier to access collective knowledge from past activities and presentations. Thanks to the CalPoly team (Darren Kraker, Nick Riley, and Kartik Malunjkar) for bringing this project to life.",
        sourceRepo: {
          label: "Source code:",
          url: "https://github.com/Internet2/i2ccc",
          text: "github.com/Internet2/i2ccc"
        },
        originalRepo: {
          label: "Originally built at:",
          url: "https://github.com/cal-poly-dxhub/internet2-chatbot",
          text: "github.com/cal-poly-dxhub/internet2-chatbot"
        }
      }
    },

    featuredQuestions: {
      title: "Try a question",
      questionIds: ['18', '24', '30']
    },

    resourcesAndLinks: {
      title: "Resources and Links",
      cloudCommunityCalendars: {
        title: "Cloud Community Calendars",
        links: [
          {
            text: "CICP Calendar",
            description: "Monthly CICP community calls and working group sessions.",
            url: "https://spaces.at.internet2.edu/spaces/cicp/pages/289113857/Cloud+Infrastructure+Community+Program+Calendar"
          },
          {
            text: "Higher Ed Cloud Community Calendar",
            description: "Broader Internet2/EDUCAUSE cloud community events.",
            url: "https://spaces.at.internet2.edu/pages/viewpage.action?pageId=94274248&spaceKey=CA&title=Higher%2BEd%2BCloud%2BCommunity"
          }
        ]
      },
      netPlusCloudPrograms: {
        title: "NET+ Cloud Programs",
        links: [
          {
            text: "NET+ AWS Homepage",
            description: "Internet2's negotiated AWS program for higher education.",
            url: "https://internet2.edu/services/amazon-web-services/"
          },
          {
            text: "NET+ GCP Homepage",
            description: "Internet2's negotiated Google Cloud program for higher education.",
            url: "https://internet2.edu/services/google-cloud-platform/"
          }
        ]
      }
    },

    contactAndSupport: {
      title: "Contact and Support",
      cicpMembership: {
        title: "CICP Questions",
        name: "Bob Flynn, Senior Program Manager",
        email: "bflynn@internet2.edu"
      },
      chatbotFeedback: {
        title: "Report a Bug or Request a Feature",
        description: "Open an issue on GitHub for bugs, suggestions, or improvements to this chatbot interface.",
        url: "https://github.com/Internet2/i2ccc/issues",
        linkText: "github.com/Internet2/i2ccc/issues"
      }
    }
  }
};
