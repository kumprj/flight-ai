export const authTheme = {
  name: 'authTheme',
  tokens: {
    components: {
      authenticator: {
        container: {
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
        },
        heading: {
          color: '#1e40af',
          fontSize: '2rem',
          fontWeight: '700',
        },
        subHeading: {
          color: '#6b7280',
          fontSize: '0.875rem',
        },
      },
      button: {
        primary: {
          backgroundColor: '#2563eb',
          color: 'white',
          fontSize: '1rem',
          fontWeight: '600',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          _hover: {
            backgroundColor: '#1d4ed8',
          },
        },
        social: {
          backgroundColor: 'white',
          color: '#1f2937',
          fontSize: '1rem',
          fontWeight: '500',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          _hover: {
            backgroundColor: '#f9fafb',
          },
        },
      },
      field: {
        label: {
          color: '#374151',
          fontSize: '0.875rem',
          fontWeight: '500',
        },
        input: {
          backgroundColor: '#f9fafb',
          color: '#1f2937',
          fontSize: '1rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          _focus: {
            borderColor: '#2563eb',
            boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
          },
        },
      },
    },
  },
};

