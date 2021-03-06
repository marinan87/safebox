package com.smartsafe;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration extends WebSecurityConfigurerAdapter {
	
	private static final String[] EXCLUSION_PATTERNS = new String[] {"/login", "/signup"};
	private static final int DEFAULT_ENC_STRENGTH = 11;
	
	@Autowired
	private UserDetailsService userDetailsServiceProvider;	
	
	@Override
	protected void configure(AuthenticationManagerBuilder auth) throws Exception {
		auth.userDetailsService(userDetailsServiceProvider)
			.passwordEncoder(passwordEncoder());
	}
	
	@Override
	protected void configure(HttpSecurity http) throws Exception {
		http
			.httpBasic()
				.and()
	        .authorizeRequests()
	            .antMatchers(EXCLUSION_PATTERNS).permitAll()
	            .anyRequest().authenticated()
	            .and()
	        .requiresChannel()
                .anyRequest().requiresSecure()
                .and()
	        .logout()
	            .permitAll()
	            .and()
	        .csrf()
	        	.disable();
	}
	
	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder(DEFAULT_ENC_STRENGTH);
	}
}