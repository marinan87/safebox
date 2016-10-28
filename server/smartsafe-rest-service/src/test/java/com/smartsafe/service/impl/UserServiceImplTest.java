package com.smartsafe.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.runners.MockitoJUnitRunner;

import com.smartsafe.dao.UserRepository;
import com.smartsafe.entity.SmartsafeUser;
import com.smartsafe.service.UserService;

@RunWith(MockitoJUnitRunner.class)
public class UserServiceImplTest {
	
	private static final String USER_ADDRESS = "testAddress";
	private static final String USER_PASSWORD = "testPassword";
	private static final String USER_KEY = "testKey";

	@InjectMocks
	private UserService userService;
	
	@Mock
	private UserRepository userRepository;
	
	private ArgumentCaptor<SmartsafeUser> userCaptor;
	
	@Before
	public void setUp() {
		userCaptor = ArgumentCaptor.forClass(SmartsafeUser.class);
	}
	
	@Test
	public void shouldCallSaveWhenCreatingUser() {
		userService.createUser(USER_ADDRESS, USER_PASSWORD, USER_KEY);
	
		verify(userRepository).save(userCaptor.capture());
		assertThat(userCaptor.getValue().getEthAddress()).isEqualTo(USER_ADDRESS);
	}
}