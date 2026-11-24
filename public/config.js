// Firebase Web SDK configuration: public identifiers, not privileged credentials.
// The public catalog connects to the existing municipal Spark deployment.
// No Analytics initialization: minimize data collection in this health-sector portal.
export const config = {
  mode:'pilot',
  backend:'supabase',
  supabase:{
    url:'https://ovppffchdkwbikdppuzh.supabase.co',
    publishableKey:'sb_publishable_ML9yMGHlj3dCrrg0FTn2jg_tCJ5vB9R'
  },
  firebase:{
    apiKey:"AIzaSyBPVOOM7VQHdJgJ7hI3-fOVD3z-x-RT_gs",
    authDomain:"tramite-discapacidad.firebaseapp.com",
    projectId:"tramite-discapacidad",
    storageBucket:"tramite-discapacidad.firebasestorage.app",
    messagingSenderId:"91732599743",
    appId:"1:91732599743:web:1bb34f5a1cb708b673770a"
  },
  appCheckSiteKey:'6Lc9ECIuAAAAACSiEJgol0qC6LjzeunULCI4K2xb',
  region:'us-central1'
};
