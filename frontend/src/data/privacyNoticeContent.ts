export const privacyNoticeContent = {
  title: "Supplemental Privacy Notice",
  subtitle: "Internet2 Cloud Community Assistant",
  effectiveDate: "March 12, 2026",

  intro: 'This Supplemental Privacy Notice ("Notice") applies to your use of the Internet2 Cloud Community Assistant (the "Assistant") and supplements the Internet2 Website Privacy Statement.',
  websitePrivacyStatementUrl: "https://internet2.edu/policies/privacy/",

  introDescription:
    "The Assistant is an AI-powered conversational tool that helps you access information about Internet2's services, programs, and community resources. Because the Assistant collects and processes information differently than other parts of our website, we are providing this supplemental notice to ensure you understand how your interactions with the Assistant are handled.",

  introNote:
    "This Notice should be read together with our Website Privacy Statement. Where this Notice provides additional or different information specific to the Assistant, this Notice takes precedence.",

  sections: [
    {
      title: "Information We Collect",
      content: "When you interact with the Assistant, Internet2 may collect:",
      subsections: [
        {
          title: "Information You Provide",
          items: [
            "Prompts",
            "Feedback you provide on responses through ratings",
          ],
        },
        {
          title: "Information Collected Through Authentication",
          items: [
            "Name, email address, and institutional identifier provided by your institution's identity provider; this information is stored separately from your Assistant activity",
          ],
        },
        {
          title: "Technical Information We Collect Automatically",
          items: [
            "Timestamps of when you interact with the Assistant",
            "Session identifiers to maintain conversation continuity",
            "The content of your queries and the Assistant's responses",
            "Feedback you provide on responses through ratings",
            "System logs that record technical errors or performance issues",
          ],
        },
      ],
      note: "Session and activity data is associated only with a randomly generated identifier and is not linked back to your authenticated identity or personal information.",
      footer:
        "This technical metadata helps us ensure the Assistant functions properly, protect against security threats, and improve the user experience.",
    },
    {
      title: "How We Use Your Information",
      content:
        "Information collected through the Assistant is used to operate and improve the Assistant and to respond to your inquiries. Specifically, we use this information to process your questions and generate relevant responses, maintain conversation continuity during your session, analyze how the Assistant is being used to improve its accuracy and usefulness, diagnose and fix technical problems, monitor for security threats and unauthorized use, and enhance the overall performance and capabilities of the service over time.",
    },
    {
      title: "Third-Party Service Providers",
      content:
        "The Assistant may rely on third-party AI technology providers to process your inputs and generate responses. These providers supply the underlying artificial intelligence capabilities that power the Assistant's ability to understand and answer your questions.",
      additionalContent:
        "Internet2 carefully selects service providers and seeks contractual assurances that they will protect your information, maintain appropriate security measures, and use your data only for purposes consistent with providing the Assistant's functionality. We require that these providers do not use your information to train their general AI models or for any purpose unrelated to operating the Assistant. However, we cannot guarantee the practices of third-party providers, and you should avoid submitting sensitive or confidential information through the Assistant.",
    },
    {
      title: "Data Retention",
      content:
        "Information collected through the Assistant Conversation and system log data may be retained for extended periods to support service improvement, security monitoring, and system analysis. Typically, this means:",
      items: [
        "Conversation data may be retained temporarily to maintain session continuity and context during your interaction with the Assistant",
        "Technical logs and system data may be retained for a limited period to monitor performance, diagnose issues, and detect security threats",
        "Aggregated or de-identified usage data may be retained longer to analyze trends and improve the Assistant's functionality",
      ],
      footer:
        "Once information is no longer needed for these purposes, it is securely deleted or anonymized. If you have questions about our specific retention practices, please contact us at privacy@internet2.edu.",
      contactEmail: "privacy@internet2.edu",
    },
    {
      title: "Important Reminder",
      content:
        "Please do not submit sensitive personal information, confidential information, or any data you would not want processed by AI systems through the Assistant. Specifically, you should avoid sharing:",
      items: [
        "Social Security numbers, driver's license numbers, passport numbers, or other government-issued identifiers",
        "Financial information such as credit card numbers, bank account details, or payment information",
        "Health information, medical records, or other protected health data",
        "Passwords, security credentials, or authentication codes",
        "Proprietary business information, trade secrets, or confidential research data",
        "Student records or information protected under FERPA",
        "Information about other individuals without their consent",
      ],
      footer:
        "The Assistant is designed to provide general information and assistance with Internet2 and community services and resources. If your question requires sharing sensitive information, please contact Internet2 directly through our secure channels at security@internet2.edu.",
      contactEmail: "security@internet2.edu",
    },
  ],

  questions: {
    text: "For questions about this Notice or your privacy, contact us at",
    email: "privacy@internet2.edu",
  },

  closing:
    "Except as described in this Notice, the Internet2 Website Privacy Statement applies. In the event of a conflict between this Notice and the Website Privacy Statement, this Notice governs.",

  acknowledgeButton: "I Acknowledge",
};
